# Deployment

This repository's reference deployment is intentionally zero-billable. Do not enable paid plans, paid model fallbacks, prepaid AI credits, or usage-based infrastructure unless you explicitly intend to do so.

## 1. Supabase Free

Create a dedicated Supabase Free project in the region required by your data-residency policy. Apply every migration in `supabase/migrations` in lexical order, then run the Supabase security and performance advisors.

Required web environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_AI_MODEL=@cf/zai-org/glm-4.7-flash`
- `CLOUDFLARE_EMBEDDING_MODEL=@cf/baai/bge-m3`
- `ALLOW_BILLABLE_AI=false`

Cloudflare Workers AI Free provides a daily no-charge allocation. On a Free Workers plan, exhausting that allocation causes further inference operations to fail rather than charging an overage. Customer Content sent to Workers AI is not used to train models or improve Cloudflare/third-party services without explicit consent under Cloudflare's current data-usage documentation. Verify current provider terms before production launch.

Paid-provider variables may remain unset. The application refuses to use them unless `ALLOW_BILLABLE_AI=true` is explicitly configured.

## 2. Web: Vercel Hobby

Import this repository into a new Vercel Hobby project. Do not attach an existing unrelated project.

Set Root Directory to `apps/web` and configure:

```text
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
CLOUDFLARE_ACCOUNT_ID=<Cloudflare Account ID>
CLOUDFLARE_API_TOKEN=<Workers AI API token>
CLOUDFLARE_AI_MODEL=@cf/zai-org/glm-4.7-flash
CLOUDFLARE_EMBEDDING_MODEL=@cf/baai/bge-m3
ALLOW_BILLABLE_AI=false
DAILY_MESSAGE_LIMIT=200
MAX_RAG_CHUNKS=10
```

Set `NEXT_PUBLIC_APP_URL` to the production Vercel origin after the first deployment if the application route needs it.

Keep Vercel AI Gateway/OpenAI credentials unset for the zero-cost deployment.

## 3. Free ingestion worker: GitHub Actions

The public repository contains `.github/workflows/free-worker.yml`. It runs hourly and can also be started manually or immediately by relevant worker/knowledge-pack changes. Private document ingestion has a separate queue-aware workflow that checks frequently without starting the heavy worker when no upload is waiting.

Add these repository Actions secrets:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

The workflow intentionally skips without error when these secrets are absent; it does not fall back to a paid service.

The workflow:

1. Starts the official ClamAV container.
2. Installs the Python/Docling worker.
3. Registers every maintained knowledge-pack manifest.
4. Verifies Cloudflare embedding access and waits for ClamAV.
5. Attempts `grounded-refresh-due`; individual unreachable external sources are recorded as degraded rather than silently accepted.
6. Runs `grounded-worker` in bounded one-shot mode and drains the current curated/private ingestion batch.
7. Cleans abandoned transient uploads.
8. Runs `grounded-source-health`. Active/partial public packs must retain usable indexed evidence; stale ingestion jobs or a pack with no usable source fail the gate.
9. Writes source-health and refresh warnings into the GitHub Actions job summary.

The free architecture trades immediate ingestion for cost: uploads may remain queued until the next scheduled run.

## 4. Embeddings

Both document chunks and user queries use Cloudflare Workers AI `@cf/baai/bge-m3` at exactly 1024 dimensions. Production stores embeddings as `halfvec(1024)` after the later storage migration, while preserving the same embedding dimensionality and retrieval model.

Do not mix embedding models in the same vector index. If the embedding model changes after indexing starts, re-embed every stored chunk and migrate the vector dimension when necessary before querying it with the new model.

## 5. Knowledge packs

India starter pack definitions and official-source registries are included in migration `202609240007_india_core_packs.sql` and under `knowledge/manifests/`.

The scheduler fetches only registered sources, re-validates redirect destinations, blocks private/link-local/loopback destinations, caps downloads, hashes content, versions changes and queues changed versions for ingestion.

A source registry is not a claim of exhaustive legal/tax coverage. Review authority, currency, effective dates and licensing before relying on a pack professionally.

## 6. Supabase Auth email templates

Because the app uses cookie-based SSR auth, configure the Confirm signup email template to send the token hash to the app route:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app
```

Set Supabase Auth Site URL to the production web origin and deliberately allow-list preview/local redirect URLs.

For password reset use:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

Verify the full email -> `/auth/confirm` -> authenticated application flow before launch.

## 7. Malware scanning

Production ingestion is configured fail-closed. The free GitHub Actions workflow exposes ClamAV only inside the runner job and sets:

```text
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
MALWARE_SCAN_REQUIRED=true
```

If ClamAV is unavailable, ingestion must fail rather than parsing unscanned files.

## 8. Go-live gates

- GitHub CI passes typecheck, lint, Next.js production build, Ruff and pytest.
- RAG release gates pass with no safety-critical failures and at least 90% overall score.
- Responsive Chromium QA passes at the maintained phone, tablet, laptop and desktop breakpoints.
- Curated source-health gate passes; degraded authoritative sources remain visible and affected packs stay marked partial.
- Supabase security advisor has no unresolved security findings.
- Auth signup/login/email/password-recovery flow verified on the production origin.
- Upload -> scheduled worker -> ready -> retrieval -> citation flow verified with fixtures.
- Two-user tenant-isolation test passes.
- India legal/tax source pack freshness and source licenses reviewed.
- Cloudflare Workers AI Free quotas are understood; quota exhaustion fails instead of invoking a paid provider.
- `ALLOW_BILLABLE_AI=false` remains set in production.
- Terms/privacy and professional-assistant disclosures are reviewed for launch jurisdictions.

## 9. Release-quality workflows

Two additional free GitHub Actions workflows are part of the launch baseline:

- `.github/workflows/rag-evals.yml` — model-scored grounding, privacy, citation, prompt-injection and jurisdiction release gates. It runs only on relevant changes, on a daily schedule, or manually.
- `.github/workflows/visual-qa.yml` — real Chromium rendering at 360×800, 390×844, 768×1024, 1366×768 and 1920×1080, with screenshots retained as an artifact.

The visual workspace route is build-only and returns 404 unless `CITERAL_QA_MODE=true` is explicitly set.

## 10. Scaling later

The free worker is intentionally not an always-on production queue consumer. If usage eventually justifies paid infrastructure, the same `FOR UPDATE SKIP LOCKED` worker can run as one or more long-lived replicas. That change should be an explicit deployment decision, not an automatic fallback.
