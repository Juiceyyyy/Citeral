# Production operations runbook

This runbook applies to the reference deployment at `citeral.vercel.app`. It preserves the project's zero-billable-services rule.

## Daily encrypted database backup

Workflow: `.github/workflows/backup.yml`

The workflow creates a compressed PostgreSQL custom-format dump using the existing `DATABASE_URL`, validates that the archive is readable, encrypts it with AES-256 through GnuPG, decrypts a temporary copy to verify the ciphertext, and uploads only the encrypted artifact.

The public repository must never receive a plaintext database dump.

### Required secret

Create one repository Actions secret manually:

- `BACKUP_PASSPHRASE`: a long random passphrase used only for backup encryption.

Do not reuse the Supabase password, GitHub token, OAuth secret, or any application API key.

The workflow deliberately remains non-destructive when this secret is missing: it validates that a dump can be produced but does not persist a backup artifact.

Encrypted artifacts are retained for three days to stay within GitHub Actions free artifact storage limits. This is a short recovery window, not an enterprise backup SLA.

## Restore procedure

1. Download an encrypted `citeral-*.dump.gpg` artifact and its `.sha256` file from the corresponding successful backup workflow run.
2. Verify the checksum:
   `sha256sum -c citeral-*.dump.gpg.sha256`
3. Decrypt locally:
   `gpg --output citeral.dump --decrypt citeral-*.dump.gpg`
4. Inspect before restoring:
   `pg_restore --list citeral.dump > restore.list`
5. Restore into a disposable PostgreSQL/Supabase test environment first. Never perform the first restore attempt directly against production.
6. Run:
   - `supabase/tests/rls_smoke.sql`
   - `supabase/tests/tenant_isolation_live.sql`
   - application health and auth smoke tests
7. Only after the test restore passes should the dump be used for a production recovery.

A managed Supabase Free project does not provide the same backup/RPO guarantees as a paid production plan. This workflow is the zero-cost reference deployment's compensating control.

## Deployment policy

- Production source of truth: GitHub `main`.
- Required checks expected before release: CI, CodeQL, responsive visual QA, production RLS/tenant smoke tests where triggered.
- Vercel preview deployments are disabled on the reference project to conserve Hobby deployment quota.
- Never enable a paid build machine, paid AI provider, paid Supabase feature, or paid integration without an explicit billing decision.
- `ALLOW_BILLABLE_AI` must remain absent or `false` on the free reference deployment.
- The public `/api/health` endpoint reports `billing_mode: free-only` once the current health contract is deployed.

## Incident response

If authorization or cross-tenant isolation is suspected:

1. Stop public sign-in or take the affected API path offline.
2. Preserve relevant provider logs without copying document contents into public issues.
3. Re-run the production tenant-isolation probe.
4. Rotate affected server-side credentials.
5. Invalidate sessions where appropriate.
6. Patch and validate RLS first; prompts are never an authorization boundary.
7. Document the incident privately before restoring normal access.

If ingestion safety is suspected:

1. Stop the private/curated ingestion workflow.
2. Do not parse the questionable object manually on a workstation.
3. Check ClamAV signature freshness and worker logs.
4. Remove the object from private Storage if it is confirmed unsafe.
5. Resume ingestion only after the scanner and parser boundary are healthy.

## External service limitations

The zero-cost reference deployment intentionally accepts the following limitations:

- Vercel Hobby deployment/build quotas can temporarily delay a new production release.
- GitHub scheduled workflows can be delayed.
- Supabase Free leaked-password screening is unavailable.
- Supabase Free does not provide enterprise backup/RPO guarantees.
- External government sources can be temporarily unreachable.

Health checks and source freshness gates should fail safely rather than silently enabling a paid fallback.
