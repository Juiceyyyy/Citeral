# Security baseline

## Authorization

- PostgreSQL RLS is authoritative; model prompts are never access-control boundaries.
- Every private bot, KB, document, conversation and portfolio belongs to a user/workspace.
- The browser receives only a Supabase publishable key. Service-role credentials are worker/server secrets only.
- Private Storage uses signed uploads and RLS-constrained object paths.
- Retrieval searches only KBs linked to the selected accessible bot.

## Prompt injection

Retrieved files and web pages are explicitly treated as untrusted evidence, not executable instructions. Authorization, tool availability and data scope remain deterministic in code/SQL. Red-team evals should include documents that request system-prompt disclosure, cross-tenant data, tool abuse and citation fabrication.

## Data handling

- TLS at the platform boundary and provider encryption at rest.
- Private buckets and expiring signed URLs.
- Deleting a document removes stored versions before deleting database metadata.
- Avoid logging document contents, prompts containing sensitive records, tokens or API keys.
- Configure retention, backups, deletion workflows, DPA/BAA requirements and regional processing to match the markets you actually serve.

## Production launch checklist

- Configure Supabase Auth password/MFA/email rules.
- Enable provider spend alerts, WAF/rate controls and error monitoring.
- Run Supabase security/performance advisors after migrations.
- Run tenant-isolation tests against two real test users.
- Set secret scanning/Dependabot in the repository.
- Review every professional source's license and refresh SLA.
- Add a CSP nonce strategy if strict CSP is required by your deployment/compliance profile.

## Ingestion boundary

- User uploads are capped at 50 MB and should be scanned by a private ClamAV service before parsing (`MALWARE_SCAN_REQUIRED=true` in production).
- Curated-source downloads use public-IP URL validation, redirect re-validation, non-standard-port blocking and bounded streaming downloads to reduce SSRF/DoS risk.
- Keep worker egress restricted at the infrastructure layer as the stronger SSRF boundary.
- Run document parsing in a resource-limited container; treat PDFs, Office files, images and archives as hostile input.

## Browser mutation requests

Cookie-authenticated JSON mutation endpoints reject explicit cross-site browser requests and mismatched `Origin` hosts. This supplements SameSite cookies and RLS; it does not replace authorization.


## Tenant identity integrity

RLS determines which rows an authenticated principal may update. A separate trigger layer prevents authenticated clients from changing identity/linkage columns such as `organization_id`, `owner_user_id`, bot type, knowledge-base ownership, document-to-KB linkage, version storage paths and conversation ownership after creation. This closes a common gap where a permissive `WITH CHECK` could otherwise allow row reassignment.

Daily chat counters are readable by their owner but are no longer directly insertable/updatable by authenticated clients. Quota consumption is performed by a narrowly scoped `SECURITY DEFINER` helper in the non-exposed `private` schema, reached through a public security-invoker wrapper that still requires an authenticated JWT.

## Free-tier Auth limitation

Supabase's leaked-password protection (HaveIBeenPwned password screening) is currently available only on the Pro plan and above. The zero-billable reference deployment therefore does not enable it. This advisor warning is expected on Supabase Free and must not be "fixed" by upgrading the project automatically.

The application still requires at least 8 characters in its signup and password-reset UI, recommends a unique password, keeps email confirmation enabled, and supports external OAuth where configured. If the deployment is deliberately upgraded to Supabase Pro later, enable leaked-password protection as part of that explicit billing decision.


## Backup and recovery

The reference deployment uses a scheduled encrypted logical backup workflow. Plaintext database dumps are never uploaded from this public repository. Persistent backup artifacts require the separate `BACKUP_PASSPHRASE` Actions secret and are retained for a short rolling recovery window to remain within free GitHub artifact storage. See `docs/OPERATIONS.md` for restore verification and incident procedures.
