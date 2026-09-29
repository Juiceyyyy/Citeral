import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { RetrievedChunk } from "./types";

const EMBEDDING_DIMENSIONS = 1024;

type CloudflareEmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

export type QueryEmbeddingResult = {
  embedding: number[] | null;
  embeddingMs: number;
  fallback: boolean;
  fallbackReason: string | null;
};

export type RetrievalMetrics = {
  embeddingMs: number;
  retrievalMs: number;
  embeddingFallback: boolean;
  embeddingFallbackReason: string | null;
  matchCount: number;
};

function adaptiveMatchCount(query: string) {
  const normalized = query.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const complex = /\b(compare|analyse|analyze|explain|summari[sz]e|across|multiple|all documents|deep|comprehensive|research|implications|differences|pros and cons)\b/.test(normalized);
  const medium = /\b(why|how|calculate|requirements?|rules?|section|regulation|tax|legal|accounting|health)\b/.test(normalized);
  // Most questions only need a few high-quality chunks. Keeping the prompt smaller
  // reduces model prefill/TTFT while still allowing deeper requests to retrieve more.
  const requested = complex || words > 45 ? 7 : medium || words > 22 ? 5 : 3;
  return Math.max(1, Math.min(env.MAX_RAG_CHUNKS, requested));
}

export function startQueryEmbedding(value: string): Promise<QueryEmbeddingResult> {
  const startedAt = Date.now();
  if (!value.trim()) {
    return Promise.resolve({ embedding: null, embeddingMs: 0, fallback: true, fallbackReason: "empty-query" });
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return Promise.resolve({
      embedding: null,
      embeddingMs: 0,
      fallback: true,
      fallbackReason: "embedding-provider-not-configured",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.EMBEDDING_TIMEOUT_MS);
  return fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/embeddings`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env.CLOUDFLARE_EMBEDDING_MODEL, input: value.slice(0, 24_000) }),
      cache: "no-store",
      signal: controller.signal,
    },
  )
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as CloudflareEmbeddingResponse | null;
      if (!response.ok) {
        const detail = body?.error?.message?.slice(0, 160);
        return {
          embedding: null,
          embeddingMs: Date.now() - startedAt,
          fallback: true,
          fallbackReason: `provider-${response.status}${detail ? `:${detail}` : ""}`,
        } satisfies QueryEmbeddingResult;
      }
      const embedding = body?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
        return {
          embedding: null,
          embeddingMs: Date.now() - startedAt,
          fallback: true,
          fallbackReason: `invalid-dimension-${embedding?.length ?? 0}`,
        } satisfies QueryEmbeddingResult;
      }
      return {
        embedding,
        embeddingMs: Date.now() - startedAt,
        fallback: false,
        fallbackReason: null,
      } satisfies QueryEmbeddingResult;
    })
    .catch((error: unknown) => ({
      embedding: null,
      embeddingMs: Date.now() - startedAt,
      fallback: true,
      fallbackReason: error instanceof Error && error.name === "AbortError" ? "timeout" : "provider-error",
    } satisfies QueryEmbeddingResult))
    .finally(() => clearTimeout(timer));
}

export async function retrieveChunks(
  supabase: SupabaseClient,
  botId: string,
  query: string,
  conversationId?: string | null,
  embeddingPromise?: Promise<QueryEmbeddingResult>,
): Promise<{ chunks: RetrievedChunk[]; metrics: RetrievalMetrics }> {
  const matchCount = adaptiveMatchCount(query);
  if (!query.trim()) {
    return {
      chunks: [],
      metrics: {
        embeddingMs: 0,
        retrievalMs: 0,
        embeddingFallback: true,
        embeddingFallbackReason: "empty-query",
        matchCount,
      },
    };
  }

  const embeddingResult = await (embeddingPromise ?? startQueryEmbedding(query));
  const retrievalStartedAt = Date.now();
  const { data, error } = await supabase.rpc("hybrid_search_chunks_scoped", {
    p_bot_id: botId,
    p_conversation_id: conversationId ?? null,
    p_query_text: query.slice(0, 8_000),
    p_query_embedding: embeddingResult.embedding,
    p_match_count: matchCount,
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  return {
    chunks: (data ?? []) as RetrievedChunk[],
    metrics: {
      embeddingMs: embeddingResult.embeddingMs,
      retrievalMs: Date.now() - retrievalStartedAt,
      embeddingFallback: embeddingResult.fallback,
      embeddingFallbackReason: embeddingResult.fallbackReason,
      matchCount,
    },
  };
}

export function chunksToContext(chunks: RetrievedChunk[]) {
  return chunks
    .map((chunk, index) => {
      const sourceId = `S${index + 1}`;
      const page = chunk.page_start
        ? `page ${chunk.page_start}${chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ""}`
        : null;
      const heading = chunk.heading_path?.length ? chunk.heading_path.join(" > ") : null;
      const meta = [chunk.document_title, page, heading, chunk.publisher, chunk.effective_from ? `effective ${chunk.effective_from}` : null]
        .filter(Boolean)
        .join(" | ");
      return `[${sourceId}] ${meta}\nCitation URL: /app/sources/${chunk.chunk_id}\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
}
