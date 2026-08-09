# Claude Code Stage 10 — Final Polish, Public Repository and Deployment Readiness

Only run after Stage 09 reports all P0 gates PASS.

Read the approved design handoff, `docs/12_DEMO_FLOW.md`, and the public-disclosure requirements in the canonical spec.

## Final implementation work

- normalize spacing, typography, density, tables, status language, empty/error/loading states
- optimize the exact 60-second path: Overview -> EXC-001 -> Three-Layer Reality -> Transaction Chain -> Ask Gaurd
- verify Financial Life and Reconciliation are strong secondary demos
- ensure technical provenance stays behind progressive disclosure
- confirm mobile/tablet graceful degradation without weakening desktop financial tables
- add/update README with product thesis, architecture, screenshots placeholders or final images, setup instructions, testing instructions, synthetic disclosure, and demo instructions
- ensure no real company references, customer data, contracts, secrets, credentials, or unsupported audit/AI claims
- production build must pass
- lint/typecheck/tests must pass
- add environment example file containing names only, no secrets
- prepare Vercel-friendly deployment configuration if needed

## Public copy boundaries

Do not claim:

- NetSuite replacement
- PCAOB / Big Four compliance
- audit approval
- autonomous accounting
- hallucination-free AI

Preferred positioning:

> The evidence layer between NetSuite inventory operations and the financial close.

## Final report

Provide:

- build status
- typecheck/lint/test status
- exact canonical baseline verification
- security/AI-off verification
- public-data scan result
- deployment steps and required environment variables
- remaining P1/P2 issues only
- final recommended commit/tag name

Do not change accounting logic during visual polish. If a visual issue exposes a logic issue, return to the appropriate prior stage and fix it with tests.
