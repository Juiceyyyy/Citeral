# Production operations

Citeral's reference deployment is deliberately zero-billable. Operational controls must fail closed instead of enabling paid infrastructure automatically.

## Health

Public health endpoint:

`GET /api/health`

It verifies that the web runtime is serving and that Supabase Auth is reachable. It also exposes only the safe AI billing-mode state (`free-only` or `billable-enabled`) without exposing credentials. It returns `200` when healthy and `503` when degraded. Responses are `no-store` and contain no secrets or user data.

`.github/workflows/production-smoke.yml` checks the public app periodically and runs database/RLS probes when the repository `DATABASE_URL` secret is configured.

## Security monitoring

- GitHub CI: TypeScript typecheck, ESLint, Next.js production build, Ruff and pytest.
- CodeQL: JavaScript/TypeScript and Python scanning.
- Dependabot: npm, pip and GitHub Actions dependency updates.
- Supabase security advisor: review after every schema/RLS/function change.
- Source health: the free RAG worker reports degraded authoritative sources and fails if an active pack has no usable indexed evidence.
- Malware scanning: hosted ingestion uses ClamAV fail-closed.

Do not remove a security warning merely to make a dashboard green. Fix the root cause or document an accepted platform limitation.

## Tenant isolation

`supabase/tests/tenant_isolation_live.sql` creates two disposable identities and representative private assistant, knowledge, retrieval, chat, portfolio and Storage records inside a transaction. It impersonates each authenticated JWT role, proves cross-tenant reads and updates are blocked, proves scoped retrieval cannot leak private chunks, verifies the owner still has access, and rolls everything back.

## Abuse controls

Expensive authenticated operations use database-backed burst limits in addition to the daily message quota.

Current defaults:

- chat: 30 requests / 60 seconds
- upload preparation: 20 / 60 seconds
- upload finalization: 20 / 60 seconds
- conversation creation: 30 / 60 seconds
- portfolio writes: 10 / 60 seconds
- account export: 4 / hour
- account deletion attempts: 3 / hour

Vercel Hobby includes DDoS mitigation and a limited free custom-WAF allowance. Application/database rate limits remain authoritative. Do not enable paid managed rules, Deep Analysis, or any feature that can create billable usage without an explicit billing decision.

## Account lifecycle

Settings provides:

- JSON account-data export
- permanent account deletion

Deletion removes user-owned private Storage objects before deleting the Auth user, revokes refresh sessions, and relies on database foreign keys/RLS-safe cleanup for remaining account-owned rows.

Never test account deletion against a real account you need to keep. Use a disposable test identity.

## Backups and restore

Supabase Free is not a substitute for an operator-controlled disaster-recovery copy.

For the public reference deployment:

1. Keep every schema change represented in `supabase/migrations/`.
2. Keep curated source manifests in Git.
3. Do not upload raw production database dumps to this public repository or public GitHub Actions artifacts.
4. Before material releases, create an encrypted operator-controlled database dump locally using the Supabase pooler/direct database credentials and store it outside the public repository.
5. Test restoration into an isolated disposable Supabase project before relying on the backup.
6. Private uploaded source files may contain sensitive data; backup them only to an approved encrypted location and preserve access-control/deletion requirements.

A fully automated off-provider backup requires a private destination and credentials. The zero-billable public repository intentionally does not invent or provision one.

## Incident response

If credentials are suspected to be exposed:

1. Rotate the affected Supabase/Cloudflare/OAuth credential at the provider.
2. Update the corresponding Vercel/GitHub secret.
3. Revoke affected user sessions when auth compromise is possible.
4. Check Vercel runtime errors, Supabase Auth/database/storage logs and GitHub worker history.
5. Disable a compromised integration rather than falling back to a paid or less secure provider.
6. Record the scope and remediation without logging private document contents or tokens.

## Release rule

A release is not considered healthy until:

- production Vercel deployment is READY;
- CI is green;
- CodeQL is green;
- responsive visual QA is green when UI changed;
- Supabase security advisor has no unresolved actionable finding;
- RAG release gate is green for prompt/retrieval changes;
- source-health gate retains usable evidence for every active/partial pack;
- `/api/health` returns 200 and reports `billing_mode: "free-only"`.
