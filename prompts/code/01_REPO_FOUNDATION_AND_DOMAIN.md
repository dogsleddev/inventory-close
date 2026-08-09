# Claude Code Stage 01 — Repository Foundation, Domain, Schemas, Tests

Continue from the same repository and prior context. Read `docs/05_SYSTEM_ARCHITECTURE.md`, `docs/06_DATA_MODEL.md`, `docs/13_BUILD_PLAN.md`, `docs/14_QA_ACCEPTANCE_CRITERIA.md`, and the final design handoff before implementation.

## Goal

Create the technical foundation **without building the main product UI**.

## Implement

1. Safely scaffold the Next.js App Router application around the existing specification repository. Preserve all canonical docs/prompts/golden files.
2. Enable strict TypeScript and linting.
3. Add Zod and the chosen test framework.
4. Establish the intended dependency direction:

   `UI / Ask Gaurd -> application services -> deterministic domain/rules -> repositories/evidence`

5. Create foundational packages/modules for:
   - `domain`
   - `rules`
   - `evidence`
   - `workflows`
   - `services`
   - `data`
   - `permissions`
   - `audit`
   - `ai`
   - optional future `mcp`
6. Implement canonical enums/value objects and TypeScript types from `06_DATA_MODEL.md`, including NetSuite transaction types, counts, evidence, exceptions, rule executions, PBCs, users/roles/permissions, and run manifests.
7. Use integer minor units for money and explicit date/time types/helpers.
8. Create runtime Zod schemas at all external/fixture boundaries.
9. Create repository interfaces. Do not couple business logic directly to JSON fixture files.
10. Add tests proving invalid fixture inputs fail validation and that `packages/domain` has zero AI dependency.

## Do not

- build Overview or dashboard
- implement Ask Gaurd
- hard-code final exceptions
- implement NetSuite writes
- duplicate accounting logic in React

## Acceptance gate

Before stopping:

- TypeScript passes
- lint passes
- test runner passes
- sample valid fixtures validate
- deliberately invalid fixtures fail
- domain has zero AI imports
- canonical docs remain intact

Report files changed, tests, deviations, assumptions, and whether Stage 02 is unblocked.
