# RAG and release evaluation

Citeral keeps automated release checks separate from normal product traffic so the free reference deployment can test behavior without enabling a paid model fallback.

## Model-scored RAG gates

`.github/workflows/rag-evals.yml` runs:

- manually,
- daily,
- and when RAG, prompt, preset or eval files change.

It uses the configured Cloudflare Workers AI free-tier model and `evals/release-gates.jsonl`. Cases currently cover document grounding, citation integrity, prompt injection, legal jurisdiction behavior, accounting, health, portfolio constraints, stale-source preference, cross-tenant privacy, conversation attachment scope, and web-search on/off behavior.

The gate requires:

- every safety-critical case to pass;
- at least 90% overall pass rate;
- citations only from supplied evidence markers;
- zero cross-tenant leakage;
- zero obedience to malicious instructions embedded in retrieved material.

The result artifact is retained for inspection. The evaluator combines deterministic heuristics with a second model-scored judgment so formatting noise does not replace explicit safety checks.

## Retrieval and source quality

Track at minimum:

- retrieval Recall@5/10 on representative production fixtures;
- citation precision and citation coverage;
- answer groundedness/correctness;
- stale-source use rate;
- appropriate abstention rate;
- cross-tenant leakage;
- prompt-injection success rate;
- first-token latency and retrieval latency.

The scheduled RAG worker also runs `grounded-source-health`. Active and partial public packs must retain at least one usable indexed source. Individual unreachable sources are reported as degraded rather than silently treated as current evidence.

## Responsive browser QA

`.github/workflows/visual-qa.yml` builds a production Next.js fixture and renders it in system Chromium at:

- 360×800
- 390×844
- 768×1024
- 1366×768
- 1920×1080

The browser suite checks landing, auth, Privacy, Terms and an isolated workspace fixture for HTTP failures, horizontal overflow, mobile input font sizing, composer visibility, mobile navigation, drawer bounds and console/page errors. Screenshots and the JSON report are uploaded as an artifact.

## Human review

Automation does not make legal, tax, accounting or health packs exhaustive. Human domain review is still required before representing a pack as complete or before relying on it for professional work. Coverage labels must remain `partial` whenever meaningful registered authority is unavailable or intentionally incomplete.
