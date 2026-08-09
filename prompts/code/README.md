# Claude Code Prompt Sequence

Run these prompts in order **after the Claude Design sequence is complete and the final design handoff has been saved into the repository**.

The prompts are intentionally staged. Claude Code must not jump ahead of the hard gates in `docs/13_BUILD_PLAN.md` and `docs/14_QA_ACCEPTANCE_CRITERIA.md`.

1. `00_CLAUDE_CODE_MASTER_KICKOFF.md` — ingest the canonical spec + approved design handoff, inspect the repo, establish constraints, and create an implementation plan without changing financial facts.
2. `01_REPO_FOUNDATION_AND_DOMAIN.md` — scaffold Next.js/TypeScript safely around the existing specs; create domain types, Zod schemas, repository interfaces, and test infrastructure.
3. `02_DATASET_GENERATOR_AND_NETSUITE_FIXTURES.md` — build the deterministic FY2026 synthetic dataset, NetSuite fixtures, source fixtures, and manifest; validate exact control totals.
4. `03_RULE_ENGINE_AND_GOLDEN_TESTS.md` — implement the deterministic rule registry, rule engine, scenario events, exception generation, reconciliation, readiness, and golden tests. **Hard gate: all core golden tests must pass before main UI work.**
5. `04_SERVICES_EVIDENCE_WORKFLOWS_SECURITY.md` — implement application services, evidence lineage, workflows, permissions, audit events, source health, and read-only NetSuite boundary.
6. `05_CORE_UI_OVERVIEW_AND_EXCEPTIONS.md` — implement the approved shell, Overview, Exceptions, EXC-001, evidence timeline, three-layer reality, and transaction-chain experience.
7. `06_FINANCIAL_LIFE_COUNTS_AND_NETSUITE_CHAINS.md` — implement Financial Life of the Unit, year-end count, cycle-count history, procurement match, commercial chain, and serial integrity.
8. `07_RECONCILIATION_VALUATION_PBC.md` — implement financial reconciliation, adjustments, valuation, and 21-item PBC/audit-support experience.
9. `08_ASK_GAURD.md` — implement tool-first Ask Gaurd, deterministic fallback, permission inheritance, citations, and adversarial guardrails only after services are stable.
10. `09_DEMO_RESET_REPLAY_AND_QA.md` — implement deterministic reset/replay, run accounting/security/AI/demo QA, and close all P0 defects.
11. `10_FINAL_POLISH_AND_DEPLOYMENT.md` — apply final visual polish, README/public disclosure, production build checks, and prepare deployment without changing canonical logic.

## Working method

- Work in one repository and preserve `/docs`, `/prompts`, `/golden`, `CANONICAL_SPEC.md`, `CHANGELOG.md`, and `SPEC_MANIFEST.json`.
- Put approved Claude Design outputs under `/design` and treat `/design/IMPLEMENTATION_HANDOFF.md` as the visual implementation reference after `prompts/design/07_FINAL_DESIGN_REVIEW_AND_POLISH.md` is complete.
- After every stage, require Claude Code to report: files changed, tests run, tests passing, deviations, unresolved assumptions, and the next gate.
- Commit after each successful stage.
- Do not allow Claude Code to silently change canonical totals or accounting behavior.
- If the specification and implementation disagree, stop the affected feature and identify whether the spec or code is wrong.

## Non-negotiable baseline

- Dataset `FY2026-DEMO-v1.1.0`
- Seed `ICG-FY2026-DEMO-002`
- Scenario script `SCENARIO-EVENTS-v1.1.0`
- 1,500 units / $4,800,000 gross inventory
- Gross inventory GL $4,812,450
- GL difference $12,450
- 15 designed exceptions
- 7 open / 8 resolved
- 7 blockers / $198,950 blocker exposure
- 81.42% close readiness
- 17/21 PBC ready/provided = 80.95%
- 91.67% source health
- NetSuite is read-only first
- `packages/domain` has zero AI dependencies
