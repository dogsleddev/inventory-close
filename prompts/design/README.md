# Claude Design Prompt Sequence

Run these prompts in order. The prompts are intentionally progressive; later prompts assume the design language from earlier prompts remains intact.

1. `00_CLAUDE_DESIGN_MASTER_BRIEF.md` — establish product design system, shell, visual grammar, and immutable financial facts.
2. `01_APP_SHELL_AND_DESIGN_SYSTEM.md` — refine the reusable application shell and components.
3. `02_OVERVIEW_AND_SIGNOFF.md` — design the Controller landing/sign-off experience.
4. `03_EXCEPTION_AND_EVIDENCE.md` — design EXC-001, the three-layer reality view, transaction chain, and evidence detail.
5. `04_FINANCIAL_LIFE_OF_UNIT.md` — design the flagship serialized-unit Financial Life experience.
6. `05_COUNTS_AND_RECONCILIATION.md` — design year-end count, NetSuite cycle counts, financial reconciliation, procurement match, commercial chain, and serial integrity.
7. `06_AUDIT_PACKAGE_AND_ASK_GAURD.md` — design PBC/audit-support workflow and grounded assistant experience.
8. `07_FINAL_DESIGN_REVIEW_AND_POLISH.md` — normalize the product, audit semantic/financial consistency, optimize the Loom path, and produce implementation handoff.

## Recommended working method

- Attach or make the entire canonical kickoff package available to Claude Design.
- Start with prompt `00` and retain the same design conversation/project if possible.
- Do not ask Claude Design to invent accounting logic or replace canonical values.
- If a mockup needs more data than the specs provide, use clearly synthetic display rows that do not change canonical financial totals.
- Freeze the approved design system before moving into later screens.
- Run `07_FINAL_DESIGN_REVIEW_AND_POLISH.md` before handing designs to Claude Code.

## Canonical references

The highest-priority product references are:

- `/CANONICAL_SPEC.md`
- `/docs/11_UX_AND_INFORMATION_ARCHITECTURE.md`
- `/docs/12_DEMO_FLOW.md`
- `/docs/14_QA_ACCEPTANCE_CRITERIA.md`
- `/docs/15_SECURITY_PERMISSIONS_AND_AUDIT_TRAIL.md`
- `/docs/16_RULE_REGISTRY_AND_DETERMINISM.md`
