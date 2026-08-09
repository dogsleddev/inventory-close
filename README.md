# Inventory Close Gaurd — Canonical Kickoff Package

> **The evidence layer between NetSuite inventory operations and the financial close.**

This repository package is the canonical specification for the independently created **Inventory Close Gaurd** prototype using the fictional company **KestrelGrid AI** and fully synthetic FY2026 data.

## Canonical baseline

- Dataset: `FY2026-DEMO-v1.1.0`
- Generator seed: `ICG-FY2026-DEMO-002`
- Scenario script: `SCENARIO-EVENTS-v1.1.0`
- Balance-sheet date: December 31, 2026
- ERP: NetSuite
- WMS / count source: NetSuite WMS
- Architecture: **Deterministic Core. Generative Edge.**
- NetSuite integration: **read-only first**
- Book inventory: **1,500 units / $4,800,000 gross carrying value**
- Gross inventory GL: **$4,812,450**
- Gross GL difference: **$12,450**
- Designed accounting exceptions: **15**
- Baseline open exceptions / blockers: **7 / 7**
- Open blocker exposure: **$198,950**
- Total designed exception exposure: **$255,650**
- Close Readiness: **81.42%**
- PBC Readiness: **17 / 21 = 80.95%**
- Data / source health: **91.67%**

## Locked product decisions

1. **Financial Life of the Unit** is a flagship feature.
2. **NetSuite / Physical Reality / Accounting Evidence** are shown separately.
3. NetSuite **cycle-count history** is a deterministic management risk lens, not auditor sampling logic.
4. **Transaction-chain completeness** is visible and deterministic; it is not an AI confidence score.
5. NetSuite is **read-only first**; Gaurd proposes and explains but does not post or mutate ERP transactions in MVP.
6. **Native NetSuite controls** remain distinct from **Inventory Close Gaurd close controls**.

## Canonical principles

- Evidence before inference.
- AI investigates. Controllers conclude.
- Operational data tells us what happened. Accounting evidence determines what belongs on the books.
- Location is not ownership.
- Confidence is not certainty.
- Audit readiness is not audit approval.
- The LLM may explain the control result. It may not create the control result.
- Financial truth lives in structured state.
- If AI disappears, the close still works.

## Reading order

Read `docs/00_PROJECT_CHARTER.md` through `docs/16_RULE_REGISTRY_AND_DETERMINISM.md` in sequence. `CANONICAL_SPEC.md` is the compressed cross-document source of truth for build prompts. `CHANGELOG.md` records the NetSuite v1.1 architectural amendment.

## Public disclosure

Inventory Close Gaurd is an independently created prototype. All companies, customers, vendors, employees, contracts, serials, transaction numbers, audit requests, workpapers, and financial data are fictional and synthetic. The prototype does not represent the systems, policies, controls, contracts, audit procedures, or conclusions of any real company.

## Claude Design handoff

The staged design prompt package is in `prompts/design/`.

Run `00_CLAUDE_DESIGN_MASTER_BRIEF.md` through `07_FINAL_DESIGN_REVIEW_AND_POLISH.md` in sequence. The prompts preserve the canonical financial baseline, the NetSuite read-only boundary, the six locked product decisions, and the 60-second demo path.

## Claude Code handoff

The staged code prompt package is in `prompts/code/`. Complete the Claude Design sequence first, save the final approved design implementation handoff under `/design`, then run `prompts/code/00_CLAUDE_CODE_MASTER_KICKOFF.md` through `10_FINAL_POLISH_AND_DEPLOYMENT.md` in order. The hard build gate is Stage 03: golden accounting tests must pass before the main UI is implemented.
