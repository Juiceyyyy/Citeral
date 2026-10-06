# Contributing to Citeral

Thanks for helping improve Citeral.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- For substantial changes, open an issue first so the approach can be discussed.
- Never include credentials, private documents, customer data, or copyrighted datasets you cannot redistribute.

## Development

1. Fork the repository and create a feature branch.
2. Copy `.env.example` to local environment files and use development-only credentials.
3. Apply Supabase migrations to a disposable development project.
4. Run the web and worker checks before opening a PR.

### Web checks

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

### Worker checks

```bash
cd apps/worker
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]' --extra-index-url https://download.pytorch.org/whl/cpu
pytest
ruff check .
```

## Pull requests

Keep PRs focused. Include:

- what changed and why;
- screenshots for meaningful UI changes;
- migrations for schema changes;
- tests/evals for retrieval, authorization or safety behavior;
- any deployment/configuration impact.

Security-sensitive changes should preserve tenant isolation in code **and** database policies. Do not replace deterministic authorization with model instructions.
