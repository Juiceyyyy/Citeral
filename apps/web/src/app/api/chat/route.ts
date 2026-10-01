import { consumeStream, convertToModelMessages, createIdGenerator, safeValidateUIMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { languageModel } from "@/lib/ai/models";
import { webSearchTools } from "@/lib/ai/web-search";
import { buildSystemPrompt, type BotRecord } from "@/lib/bots/system-prompt";
import { retrieveChunks, chunksToContext, startQueryEmbedding, type RetrievalMetrics } from "@/lib/rag/retrieve";
import { assertUsageAvailable } from "@/lib/security/usage";
import { isTrustedMutation } from "@/lib/security/request";
import { getPortfolioContext } from "@/lib/portfolio/server";
import { env } from "@/lib/env";

export const maxDuration = 60;
const bodySchema = z.object({ messages: z.array(z.unknown()).min(1).max(100), botId: z.string().uuid(), conversationId: z.string().uuid(), webSearch: z.boolean().default(false) });

function latestUserText(messages: UIMessage[]) {
  const message = [...messages].reverse().find((item) => item.role === "user");
  if (!message) return "";
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .slice(0, 16_000);
}

function responseTokenBudget(query: string) {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const asksForDepth = /\b(comprehensive|detailed|in[- ]depth|deep dive|thorough|full analysis|long[- ]form|step[- ]by[- ]step|everything|exhaustive)\b/.test(normalized);
  if (asksForDepth || words > 90) return 1_600;
  if (words < 16) return 800;
  return 1_100;
}

const EMPTY_RETRIEVAL_METRICS: RetrievalMetrics = {
  embeddingMs: 0,
  retrievalMs: 0,
  embeddingFallback: true,
  embeddingFallbackReason: "empty-query",
  matchCount: 0,
};

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
  try {
    if (!isTrustedMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    const { supabase, userId } = await requireApiUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (declaredLength > 1_500_000) return NextResponse.json({ error: "Chat request too large" }, { status: 413 });
    const raw = await req.json();
    if (JSON.stringify(raw).length > 1_500_000) return NextResponse.json({ error: "Chat request too large" }, { status: 413 });
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "Invalid chat request" }, { status: 400 });

    // Keep the tool schema available during validation so conversations that already
    // contain web-search tool parts remain valid even when Web is off for this turn.
    const validated = await safeValidateUIMessages({ messages: parsed.data.messages, tools: webSearchTools });
    if (!validated.success) return NextResponse.json({ error: "Invalid chat message structure" }, { status: 400 });
    const messages = validated.data;
    const query = latestUserText(messages);
    const maxOutputTokens = responseTokenBudget(query);

    const embeddingPromise = startQueryEmbedding(query);
    const accessStartedAt = Date.now();
    const [botResult, profileResult, conversationResult, attachmentMembershipResult] = await Promise.all([
      supabase
        .from("bots")
        .select("id,name,bot_type,description,instructions,jurisdiction_country,jurisdiction_region,citations_required,web_enabled,organization_id")
        .eq("id", parsed.data.botId)
        .maybeSingle(),
      supabase.from("profiles").select("global_instructions").eq("id", userId).maybeSingle(),
      supabase
        .from("conversations")
        .select("id,bot_id")
        .eq("id", parsed.data.conversationId)
        .eq("bot_id", parsed.data.botId)
        .eq("owner_user_id", userId)
        .maybeSingle(),
      supabase
        .from("conversation_documents")
        .select("document_id")
        .eq("conversation_id", parsed.data.conversationId),
      assertUsageAvailable(supabase),
    ]).then(([bot, profile, conversation, attachmentMembership]) => [bot, profile, conversation, attachmentMembership] as const);
    const accessMs = Date.now() - accessStartedAt;

    const { data: bot, error: botError } = botResult;
    const { data: profile } = profileResult;
    const { data: conversation } = conversationResult;
    const { data: attachmentMembership, error: attachmentMembershipError } = attachmentMembershipResult;
    if (botError || !bot) return NextResponse.json({ error: "Assistant not found" }, { status: 404 });
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (attachmentMembershipError) return NextResponse.json({ error: "Could not verify conversation attachments" }, { status: 500 });

    const attachmentIds = (attachmentMembership ?? []).map((item) => item.document_id);
    if (attachmentIds.length) {
      const { data: blockedAttachments, error: blockedAttachmentError } = await supabase
        .from("documents")
        .select("id,title,status")
        .in("id", attachmentIds)
        .neq("status", "ready");
      if (blockedAttachmentError) return NextResponse.json({ error: "Could not verify attachment readiness" }, { status: 500 });
      if ((blockedAttachments?.length ?? 0) > 0) {
        return NextResponse.json(
          {
            error: "Wait for every attached file to show Ready before sending a message.",
            attachments: blockedAttachments,
          },
          { status: 409 },
        );
      }
    }

    const retrievalPromise = query
      ? retrieveChunks(supabase, bot.id, query, conversation.id, embeddingPromise)
      : Promise.resolve({ chunks: [], metrics: EMPTY_RETRIEVAL_METRICS });
    const portfolioPromise = bot.bot_type === "portfolio"
      ? getPortfolioContext(supabase, userId)
      : Promise.resolve(undefined);
    const [{ chunks, metrics: retrievalMetrics }, portfolioContext] = await Promise.all([
      retrievalPromise,
      portfolioPromise,
    ]);

    const ragContext = chunksToContext(chunks);
    const system = buildSystemPrompt(
      bot as BotRecord,
      ragContext,
      portfolioContext,
      profile?.global_instructions,
      parsed.data.webSearch,
    );
    const tools = parsed.data.webSearch ? webSearchTools : undefined;
    const modelHistory = messages.slice(-env.CHAT_HISTORY_MESSAGES);
    const modelMessages = await convertToModelMessages(modelHistory);
    const preModelMs = Date.now() - requestStartedAt;
    const modelStartedAt = Date.now();
    let firstTextAt: number | null = null;

    const result = streamText({
      model: languageModel(),
      system,
      messages: modelMessages,
      tools,
      // Keep routine chat concise enough to stream quickly. Explicitly detailed
      // questions receive a larger budget via responseTokenBudget().
      maxOutputTokens,
      // One model step is enough normally. When Web is enabled, allow the model
      // to search and then consume the tool result before producing its answer.
      stopWhen: stepCountIs(parsed.data.webSearch ? 3 : 1),
      maxRetries: 1,
      abortSignal: req.signal,
      onChunk: ({ chunk }) => {
        if (firstTextAt === null && chunk.type === "text-delta" && chunk.text.length > 0) {
          firstTextAt = Date.now();
        }
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 18 }),
      consumeSseStream: consumeStream,
      onFinish: async ({ messages: complete, isAborted }) => {
        const streamFinishedAt = Date.now();
        await supabase.rpc("save_conversation_messages", { p_conversation_id: conversation.id, p_messages: complete });
        let usage: Awaited<typeof result.usage> | undefined;
        try { usage = await result.usage; } catch { usage = undefined; }
        await supabase.from("usage_events").insert({
          user_id: userId,
          organization_id: bot.organization_id,
          kind: "chat",
          bot_id: bot.id,
          input_tokens: usage?.inputTokens ?? null,
          output_tokens: usage?.outputTokens ?? null,
          metadata: {
            rag_chunks: chunks.length,
            rag_match_count: retrievalMetrics.matchCount,
            scoped_retrieval: true,
            embedding_ms: retrievalMetrics.embeddingMs,
            retrieval_ms: retrievalMetrics.retrievalMs,
            embedding_fallback: retrievalMetrics.embeddingFallback,
            embedding_fallback_reason: retrievalMetrics.embeddingFallbackReason,
            access_ms: accessMs,
            pre_model_ms: preModelMs,
            ttft_ms: firstTextAt === null ? null : firstTextAt - requestStartedAt,
            model_ttft_ms: firstTextAt === null ? null : firstTextAt - modelStartedAt,
            generation_ms: streamFinishedAt - modelStartedAt,
            total_ms: Date.now() - requestStartedAt,
            history_messages: modelHistory.length,
            max_output_tokens: maxOutputTokens,
            fast_reasoning_mode: env.CLOUDFLARE_AI_MODEL === "@cf/zai-org/glm-4.7-flash",
            web_search: parsed.data.webSearch,
            aborted: isAborted,
          },
        });
        const activityAt = new Date().toISOString();
        await supabase
          .from("conversations")
          .update({
            updated_at: activityAt,
            last_message_at: activityAt,
            archived_at: null,
            title: query.slice(0, 80) || "Conversation",
          })
          .eq("id", conversation.id);
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected chat error";
    const status = message.includes("limit") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
