import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertRateAvailable } from "@/lib/security/rate-limit";

const MAX_EXPORT_ROWS = 10_000;

function ids(rows: Array<{ id: string }> | null | undefined) {
  return (rows ?? []).map((row) => row.id);
}

export async function GET() {
  try {
    const { supabase, userId } = await requireApiUser();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await assertRateAvailable(supabase, "account_export", 4, 3600);

    const [
      userResult,
      profileResult,
      membershipsResult,
      botsResult,
      knowledgeBasesResult,
      documentsResult,
      conversationsResult,
      portfoliosResult,
      usageResult,
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("organization_members").select("organization_id,user_id,role,created_at,organizations(id,name,slug,created_at,updated_at)").eq("user_id", userId).limit(MAX_EXPORT_ROWS),
      supabase.from("bots").select("*").eq("owner_user_id", userId).order("created_at").limit(MAX_EXPORT_ROWS),
      supabase.from("knowledge_bases").select("*").eq("owner_user_id", userId).order("created_at").limit(MAX_EXPORT_ROWS),
      supabase.from("documents").select("id,organization_id,owner_user_id,knowledge_base_id,title,mime_type,byte_size,raw_storage_bytes,processed_byte_size,chunk_count,status,source_url,publisher,authority_level,jurisdiction_country,jurisdiction_region,published_at,effective_from,effective_until,is_current,metadata,created_at,updated_at").eq("owner_user_id", userId).order("created_at").limit(MAX_EXPORT_ROWS),
      supabase.from("conversations").select("*").eq("owner_user_id", userId).order("created_at").limit(MAX_EXPORT_ROWS),
      supabase.from("portfolios").select("*").eq("owner_user_id", userId).order("created_at").limit(MAX_EXPORT_ROWS),
      supabase.from("usage_events").select("id,kind,bot_id,input_tokens,output_tokens,cost_micros,metadata,created_at").eq("user_id", userId).order("created_at").limit(MAX_EXPORT_ROWS),
    ]);

    const errors = [
      profileResult.error,
      membershipsResult.error,
      botsResult.error,
      knowledgeBasesResult.error,
      documentsResult.error,
      conversationsResult.error,
      portfoliosResult.error,
      usageResult.error,
    ].filter(Boolean);
    if (errors.length) throw new Error(errors[0]?.message || "Could not export account data");

    const conversationIds = ids(conversationsResult.data);
    const documentIds = ids(documentsResult.data);
    const portfolioIds = ids(portfoliosResult.data);

    const [messagesResult, versionsResult, chunksResult, positionsResult] = await Promise.all([
      conversationIds.length
        ? supabase.from("messages").select("*").in("conversation_id", conversationIds).order("conversation_id").order("position").limit(MAX_EXPORT_ROWS)
        : Promise.resolve({ data: [], error: null }),
      documentIds.length
        ? supabase.from("document_versions").select("id,document_id,version_number,content_hash,parser_version,status,extracted_text,error_message,created_at,processed_at").in("document_id", documentIds).order("document_id").order("version_number").limit(MAX_EXPORT_ROWS)
        : Promise.resolve({ data: [], error: null }),
      documentIds.length
        ? supabase.from("chunks").select("id,document_id,document_version_id,chunk_index,content,token_count,page_start,page_end,heading_path,metadata,created_at").in("document_id", documentIds).order("document_id").order("chunk_index").limit(MAX_EXPORT_ROWS)
        : Promise.resolve({ data: [], error: null }),
      portfolioIds.length
        ? supabase.from("portfolio_positions").select("*").in("portfolio_id", portfolioIds).order("portfolio_id").limit(MAX_EXPORT_ROWS)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const childErrors = [messagesResult.error, versionsResult.error, chunksResult.error, positionsResult.error].filter(Boolean);
    if (childErrors.length) throw new Error(childErrors[0]?.message || "Could not export account data");

    const payload = {
      export_version: 1,
      exported_at: new Date().toISOString(),
      account: {
        id: userId,
        email: userResult.data.user?.email ?? null,
        created_at: userResult.data.user?.created_at ?? null,
        last_sign_in_at: userResult.data.user?.last_sign_in_at ?? null,
        providers: userResult.data.user?.app_metadata?.providers ?? [],
      },
      profile: profileResult.data,
      memberships: membershipsResult.data ?? [],
      assistants: botsResult.data ?? [],
      private_knowledge_bases: knowledgeBasesResult.data ?? [],
      documents: documentsResult.data ?? [],
      document_versions: versionsResult.data ?? [],
      document_chunks: chunksResult.data ?? [],
      conversations: conversationsResult.data ?? [],
      messages: messagesResult.data ?? [],
      portfolios: portfoliosResult.data ?? [],
      portfolio_positions: positionsResult.data ?? [],
      usage_events: usageResult.data ?? [],
      derived_data_note: "Private document text is exported as retrieval chunks. Vector embeddings and internal search indexes are intentionally omitted.",
      truncation: {
        max_rows_per_collection: MAX_EXPORT_ROWS,
        messages: (messagesResult.data?.length ?? 0) >= MAX_EXPORT_ROWS,
        document_versions: (versionsResult.data?.length ?? 0) >= MAX_EXPORT_ROWS,
        document_chunks: (chunksResult.data?.length ?? 0) >= MAX_EXPORT_ROWS,
        usage_events: (usageResult.data?.length ?? 0) >= MAX_EXPORT_ROWS,
      },
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="citeral-data-export.json"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export account data";
    const status = message.includes("Too many requests") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
