# Citeral scalability invariants

This document records the constraints that keep the RAG architecture safe on free-tier infrastructure while leaving a clean path to larger deployments.

## Durable knowledge, transient raw files

Raw uploads are ingestion inputs, not the long-term knowledge representation. After successful parsing, chunking, malware scanning, embedding and database commit, private raw objects are deleted by default. Durable state is the normalized document/version record, source-aware chunks, search indexes and embeddings.

Public authoritative sources are re-fetchable from canonical URLs. Private source retention can be introduced later as an explicit quota-consuming option without changing the retrieval model.

## Private quota dimensions

Private knowledge is bounded by multiple dimensions rather than uploaded file size alone:

- document count
- transient raw-storage bytes
- durable processed text bytes
- chunk count

Upload reservations are short lived and count against raw-storage/document capacity before a signed storage upload is created. This prevents concurrent uploads from bypassing quota checks.

## Scope and ownership

Ownership and retrieval membership remain separate:

- a document has one canonical owner/source identity
- `knowledge_base_documents` can expose one document to multiple packs without copying chunks
- user global, assistant-private and conversation-only scopes are resolved before ranking
- conversation attachments never become globally retrievable merely because they share a private ingestion KB

## Retrieval latency

The chat request starts query embedding as soon as the validated user text is available, in parallel with access/quota/database lookups. Embeddings have a bounded timeout; on provider latency or failure, scoped lexical retrieval remains available rather than blocking the entire response.

RAG depth is adaptive. Short factual queries retrieve fewer chunks; broader analysis can use the configured maximum. Chat history is separately bounded to avoid growing model-input latency with conversation length.

Latency metadata records access, embedding, retrieval, pre-model and end-to-end request time so tuning is evidence based.

## Storage efficiency roadmap

The current 1024-dimensional BGE-M3 space remains compatible while optimizations roll out. The next storage migration is to pgvector `halfvec(1024)` after CI and RPC compatibility verification. Full Docling metadata is not persisted per chunk when equivalent source context is already represented by dedicated columns.

## Failure handling

- terminal quota failures do not retry repeatedly
- successful/terminal private ingestion releases raw storage
- cleanup failures retain the database storage path so a later cleanup can retry safely
- abandoned signed uploads are garbage-collected from expired upload reservations by the existing free GitHub Actions worker
- external embedding failure degrades retrieval quality, not request availability

No paid fallback or billable infrastructure should be enabled implicitly.
