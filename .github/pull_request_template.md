## Summary

Describe what changed and why.

## Production checklist

- [ ] No paid service, paid provider fallback, or billable feature was enabled.
- [ ] CI passes.
- [ ] CodeQL passes.
- [ ] UI changes pass responsive visual QA.
- [ ] Database changes include a migration and preserve RLS.
- [ ] Authorization changes were checked against cross-tenant access.
- [ ] Auth/email changes preserve Google, GitHub, and email/password only.
- [ ] Upload/ingestion changes preserve bounded downloads, malware scanning, and private Storage.
- [ ] Curated-source changes use authoritative sources and preserve source-health behavior.
- [ ] New secrets are server-only and are not committed or exposed to the browser.
- [ ] Production behavior and operations documentation were updated when relevant.

## Validation

List the checks, workflows, or manual tests performed.

## Rollback

Describe how this change can be reverted safely if production validation fails.
