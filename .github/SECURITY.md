# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for vulnerabilities that could expose credentials, private documents, tenant data, authentication bypasses, RLS/Storage-policy bypasses, prompt-injection-to-action chains, SSRF, malware-upload bypasses, or other exploitable security weaknesses.

Use GitHub's private vulnerability reporting / security advisory feature for this repository when available. Include reproduction steps, affected components and potential impact.

## Supported version

Until the project publishes tagged stable releases, security fixes target the latest `main` branch.

## Security boundaries

Citeral treats the database/storage authorization layer as authoritative. LLM instructions are not an access-control mechanism.
