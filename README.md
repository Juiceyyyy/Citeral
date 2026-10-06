<p align="center">
  <img src="apps/web/public/citeral-mark.svg" alt="Citeral" width="112" />
</p>

<h1 align="center">Citeral</h1>

<p align="center">
  Evidence-grounded AI assistants for private documents, curated knowledge and inspectable answers.
</p>

<p align="center">
  <a href="https://citeral.vercel.app"><strong>Live app</strong></a>
  ·
  <a href="docs/ARCHITECTURE.md">Architecture</a>
  ·
  <a href="docs/SECURITY.md">Security</a>
  ·
  <a href="docs/DEPLOYMENT.md">Deployment</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-3b82f6.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E" />
  <img alt="Cloudflare Workers AI" src="https://img.shields.io/badge/Workers%20AI-Cloudflare-F38020" />
  <img alt="Python" src="https://img.shields.io/badge/worker-Python-3776AB" />
</p>

## What is Citeral?

Citeral is an open-source, multi-tenant RAG platform for specialized AI assistants that work from private files, maintained knowledge packs and optionally the live web.

The product is built around one principle: **important answers should be traceable back to the evidence used to produce them.**

Every workspace receives six ready-to-use built-in assistants:

- **Document Analyst** — read, compare, summarize and cite private documents
- **Health** — work from maintained health sources and user-provided material
- **Legal** — jurisdiction-aware legal research with explicit location context
- **Portfolio** — deterministic portfolio structure and exposure analysis
- **Study** — turn source material into guided learning and revision workflows
- **Tax & Accounting** — work through records and jurisdiction-specific source material

Built-in assistants are provisioned automatically and are usable immediately. They remain editable, and users can restore their preset defaults at any time. **Custom Assistant** is the only assistant type that requires initial configuration.

## Knowledge model

Citeral separates knowledge by scope instead of copying everything into every assistant.

- **Shared curated knowledge** is stored once and can be linked to many assistants or knowledge packs.
- **Assistant-private knowledge** contains uploads meant only for one assistant.
- **Global user knowledge** can be made available across that user's assistants.
- **Conversation attachments** remain scoped to the conversation that received them.
- **Public canonical sources** are deduplicated so the same source can belong to multiple packs without duplicating its chunks and embeddings.
- **Jurisdiction packs** attach from the user's saved country/region settings. Citeral does not silently infer a legal jurisdiction.

This keeps authorization explicit while avoiding unnecessary storage duplication.

## RAG pipeline

Citeral combines semantic and lexical retrieval rather than depending on embeddings alone.

```text
User message
    │
    ├── conversation context
    ├── assistant instructions
    ├── assistant-private knowledge
    ├── global user knowledge
    └── curated / jurisdiction knowledge packs
    │
    ▼
Query embedding + scoped retrieval
    │
    ├── PostgreSQL full-text search
    ├── pgvector semantic search
    ├── Reciprocal Rank Fusion
    ├── source / scope / jurisdiction filters
    └── freshness + effective-date filtering
    │
    ▼
Grounded prompt
    │
    ▼
Cloudflare Workers AI
    │
    ▼
Streaming answer + inspectable citations
```

Current retrieval/storage design:

- multilingual `@cf/baai/bge-m3` embeddings
- 1024 embedding dimensions
- PostgreSQL `halfvec(1024)` storage to reduce vector footprint
- HNSW vector indexing
- hybrid lexical + semantic retrieval
- Reciprocal Rank Fusion
- scoped retrieval across assistant, user-global and conversation knowledge
- adaptive retrieval depth
- stale-source and effective-date filtering
- query-embedding timeout with lexical fallback
- canonical-source deduplication across public packs

## Product experience

The web application is designed around a simple assistant-first workspace rather than a configuration dashboard.

- ChatGPT-style responsive sidebar with compact collapsed rail
- built-in assistants grouped under a single Assistants section
- `New custom assistant` kept inside the Assistants flow instead of as a separate primary destination
- full-height desktop navigation that remains fixed while long pages scroll
- responsive mobile drawer and fixed mobile header
- scalable conversation history with cursor-based incremental loading
- drag/drop, paste and upload support inside chat workflows
- streaming responses with markdown rendering
- source citations with evidence inspection
- editable assistant settings and Restore Preset Defaults
- global custom instructions
- saved country/region settings for jurisdiction-aware assistants
- restrained liquid-glass surfaces with reduced-motion support

## Zero-cost reference deployment

The default deployment path is deliberately designed to stay within free tiers and to **fail rather than silently fall back to billable AI**.

| Layer | Default service |
| --- | --- |
| Web app | Vercel Hobby |
| Database / Auth / Storage | Supabase Free |
| Generation | Cloudflare Workers AI free allocation |
| Embeddings | Cloudflare Workers AI `bge-m3` |
| Ingestion / refresh | GitHub Actions |
| Malware scanning | ClamAV in GitHub Actions |

Paid AI fallbacks are disabled by default. `ALLOW_BILLABLE_AI=true` must be set explicitly before an AI Gateway or direct OpenAI fallback may be used.

The hosted ingestion worker is intentionally batch-oriented rather than always-on. New uploads may wait for the next scheduled GitHub Actions run before indexing completes.

## Architecture

```text
                           ┌──────────────────────────┐
                           │       Next.js app        │
                           │ Vercel Hobby · Mumbai    │
                           └────────────┬─────────────┘
                                        │
                         auth / data / retrieval
                                        │
                           ┌────────────▼─────────────┐
                           │        Supabase          │
                           │ Postgres · Auth · Storage│
                           │ RLS · FTS · pgvector     │
                           └───────┬─────────┬────────┘
                                   │         │
                           retrieval│         │upload queue
                                   │         │
                    ┌──────────────▼─┐   ┌───▼──────────────────┐
                    │ RAG orchestrator│   │ GitHub Actions worker │
                    │ hybrid retrieval│   │ Docling · ClamAV      │
                    └───────┬─────────┘   │ source refresh        │
                            │             └──────────┬────────────┘
                            │                        │
                            └────────────┬───────────┘
                                         │
                              ┌──────────▼──────────┐
                              │ Cloudflare Workers │
                              │ AI generation +    │
                              │ BGE-M3 embeddings  │
                              └─────────────────────┘
```

A bot is configuration, not a separate service: preset behavior + user instructions + attached knowledge bases + tools + jurisdiction + retrieval/model policy.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Highlights

### Web application

- Next.js App Router + TypeScript + Tailwind CSS
- Supabase SSR authentication and session refresh
- PostgreSQL Row Level Security for tenant isolation
- six automatically provisioned built-in assistants
- user-created Custom assistants
- private signed document uploads
- streaming AI chat
- hybrid RAG with inline citations
- source inspection
- optional web search per turn
- persistent, incrementally loaded conversation history
- global and assistant-specific knowledge scopes
- country/region-aware knowledge-pack attachment
- daily usage-quota reservation
- signup confirmation, login/logout and password recovery

### Document ingestion worker

- Python + Docling structural document processing
- page, heading and table source-location retention
- BGE-M3 multilingual embeddings
- `FOR UPDATE SKIP LOCKED` job claiming
- one-shot execution for scheduled GitHub Actions
- retry and stale-lock recovery
- SHA-256 content hashing
- immutable document versions
- canonical public-source deduplication
- redirect-aware SSRF controls
- bounded source downloads
- fail-closed ClamAV support
- shared curated/jurisdiction manifest importer
- scheduled source registration and refresh
- persisted authoritative-source health and degraded-source reporting
- source-health release gate that prevents empty public packs from passing silently
- transient raw private uploads after processing

### Portfolio assistant

Portfolio calculations happen deterministically before the language model explains the results.

The module calculates:

- security weights
- largest / top-3 / top-5 concentration
- HHI concentration
- effective number of holdings (`1 / HHI`)
- sector and industry exposure
- asset-class exposure
- geographic exposure
- currency exposure
- account exposure
- duplicate-security aggregation across accounts
- concentration and data-quality flags

The default assistant policy does not provide price targets, expected-return forecasts, options strategies, leverage calls or market-timing instructions.

## Repository layout

```text
.
├── apps/
│   ├── web/                 # Next.js application
│   └── worker/              # Docling / embedding ingestion worker
├── supabase/
│   ├── migrations/          # schema, RLS, storage and retrieval RPCs
│   └── tests/
├── knowledge/manifests/     # curated knowledge-pack manifests
├── evals/                   # RAG / safety evaluation fixtures
├── docs/                    # architecture, security, deployment and eval docs
└── .github/workflows/       # CI + scheduled free-tier ingestion
```

## Quick start

### 1. Create a Supabase project

Create a fresh Supabase project and apply every SQL file in `supabase/migrations` in lexical order.

Do not reuse an unrelated production database. The migrations create the schema, RLS rules, retrieval functions, storage controls and built-in assistant infrastructure.

### 2. Configure environment variables

Copy `.env.example` and configure Supabase plus the free AI provider.

Core AI defaults:

```text
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_AI_MODEL=@cf/zai-org/glm-4.7-flash
CLOUDFLARE_EMBEDDING_MODEL=@cf/baai/bge-m3
EMBEDDING_DIMENSIONS=1024
ALLOW_BILLABLE_AI=false
```

Never commit populated secrets.

### 3. Start the web app

From the repository root:

```bash
npm install
npm --workspace apps/web run dev
```

Or from `apps/web`:

```bash
npm install
npm run dev
```

### 4. Run ingestion locally

```bash
cd apps/worker
python -m venv .venv
. .venv/bin/activate
pip install . --extra-index-url https://download.pytorch.org/whl/cpu
grounded-worker
```

On Windows PowerShell:

```powershell
cd apps/worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install . --extra-index-url https://download.pytorch.org/whl/cpu
grounded-worker
```

For the hosted zero-cost path, configure the repository secrets documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). `.github/workflows/free-worker.yml` then registers known manifests, refreshes due sources and processes queued documents on its schedule.

## Smoke test

After setup:

1. Create and confirm an account.
2. Verify the six built-in assistants are available without manual configuration.
3. Open Document Analyst and upload a PDF.
4. Wait for the document to reach `ready`.
5. Ask a question that requires information from that PDF.
6. Open a citation and verify its page/section evidence.
7. Open Legal or Tax & Accounting and explicitly configure/verify the intended country/region.
8. Create a second test user and verify tenant isolation.
9. Import a portfolio CSV and inspect deterministic portfolio metrics.
10. Create a Custom Assistant and verify its private knowledge remains isolated from other assistants.

## Knowledge packs

The repository contains maintained pack definitions and source registries without claiming exhaustive legal, tax or clinical coverage.

Current pack architecture supports shared global sources plus country/region-specific packs. India legal/accounting and global/India health packs can be registered through the source pipeline. A single canonical source may belong to multiple knowledge packs without duplicating its stored chunks.

Jurisdiction-aware assistants use the user's saved location setting. Operators are responsible for source licensing, redistribution rights, freshness, domain-specific evaluation and professional-assistant disclosures.

## Security and privacy

The language model does not decide authorization.

Access is enforced by PostgreSQL Row Level Security, authenticated server-side operations and private Storage policies. Retrieved documents and web content are treated as untrusted evidence, so prompt injection inside a document cannot grant database permissions.

Additional protections include:

- private per-user uploads
- scoped assistant and conversation retrieval
- signed uploads
- raw-upload quotas and processed-data quotas
- SSRF controls for curated-source refresh
- bounded downloads
- optional fail-closed ClamAV scanning
- same-origin checks for mutation endpoints
- no automatic paid-AI fallback

Please read [`docs/SECURITY.md`](docs/SECURITY.md). To report a vulnerability, follow [`.github/SECURITY.md`](.github/SECURITY.md).

## Development checks

The main CI validates both the web app and ingestion worker.

```bash
npm run typecheck
npm run lint
npm run build
```

Worker checks:

```bash
cd apps/worker
ruff check .
pytest
```

Release-quality automation also includes model-scored RAG/safety gates and real Chromium responsive QA across phone, tablet, laptop and desktop breakpoints. See [`docs/EVALS.md`](docs/EVALS.md).

## Deployment

The reference production split is:

- `apps/web` → Vercel Hobby
- Supabase Free → Postgres / Auth / Storage / pgvector
- `.github/workflows/free-worker.yml` → ingestion, manifest registration, cleanup and source refresh
- Cloudflare Workers AI → generation and BGE-M3 embeddings

The web app is configured for a single Vercel function region close to the current Supabase deployment to avoid unnecessary cross-region database latency.

Automatic Git deployments are intentionally restricted so feature branches do not consume unnecessary Hobby preview-build capacity; `main` remains the production branch.

No Render resource is required by the default deployment.

## License

Released under the [MIT License](LICENSE).
