# Claude Code Stage 09 — Demo Reset, Replay, Full QA and P0 Closure

Read `docs/12_DEMO_FLOW.md`, `docs/14_QA_ACCEPTANCE_CRITERIA.md`, and `docs/16_RULE_REGISTRY_AND_DETERMINISM.md`.

## Implement

1. `Reset Demo` that reconstructs baseline from seed + rules + scenario events rather than hard-coding final state.
2. deterministic run manifest and `Reproduce Close` / replay comparison.
3. dependency-aware PBC refresh behavior when underlying controlled state changes.
4. deep routes required by demo.
5. AI-off fallback path.

## Reset must restore exactly

- 15 designed exceptions
- 7 open / 8 resolved
- 7 blockers
- $198,950 blocker exposure
- $12,450 GL difference
- 81.42% close readiness
- 80.95% PBC readiness
- 91.67% source health

## Run the full QA suite

Execute all applicable checks in `14_QA_ACCEPTANCE_CRITERIA.md`, including:

- accounting math
- all 15 scenario behavior
- source lineage
- read-only NetSuite boundary
- permissions / SOD
- source failure/fail-visible behavior
- PBC versioning
- Ask Gaurd adversarial tests
- demo reset/replay
- no real-company data / no secrets
- exact stale-reference scan for deprecated dataset names and deprecated completeness-serial references

## Hard release gate

Do not move to final polish with any P0 open. Provide a release-gate matrix with PASS/FAIL and evidence (test names/commands) for each major category.
