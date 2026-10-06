# Architecture

Citeral is a multi-tenant RAG SaaS. A bot is configuration, not a separate application: behavior/policy + attached knowledge bases + optional tools + jurisdiction + model policy.

## Request path

1. Supabase Auth establishes the user session.
2. PostgreSQL RLS determines which bot, conversation, knowledge base, documents and chunks the user may access.
3. The chat route embeds the current question.
4. `hybrid_search_chunks` performs semantic HNSW retrieval and PostgreSQL full-text retrieval, fuses ranks with RRF, and only searches knowledge bases attached to the selected bot.
5. Retrieved evidence is serialized with stable `[S#]` markers and inspectable internal citation URLs.
6. Optional web search is enabled per bot and per turn.
7. The domain policy + custom instructions + retrieved context + deterministic portfolio analytics are passed to the model.
8. AI SDK streams the response and persists the final UI messages.

## Ingestion path

`browser -> signed private Storage upload -> document/version/job rows -> Python worker -> Docling -> HybridChunker -> embeddings -> pgvector chunks`

The worker uses `FOR UPDATE SKIP LOCKED`, retry limits, stale-job recovery, content hashes, page source-location metadata, headings, and idempotent per-version chunk replacement.

## Knowledge packs

Public curated packs are shared once. Private user knowledge bases are scoped to an organization. Jurisdiction packs use `source_registry` records with publisher, authority, jurisdiction, license, refresh cadence and content hash. Source refresh creates immutable document versions instead of overwriting history.

Do not claim a professional corpus is complete simply because a bot template exists. A production operator must curate, license, review and monitor the actual sources for each supported jurisdiction/domain.
