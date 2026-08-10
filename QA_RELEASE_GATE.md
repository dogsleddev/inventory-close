# Release Gate — FY2026 Inventory Close Gaurd

Stage 09 (`prompts/code/09_DEMO_RESET_REPLAY_AND_QA.md`) closes with a hard gate:
**no P0 may be open before final polish.** This file records the result of running the
`docs/14_QA_ACCEPTANCE_CRITERIA.md` checks against the tree, with the evidence for each.

Run everything below with:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

| | |
|---|---|
| Commit | `30494c0` (stage 09 + full-tree review remediation) |
| Suite | **597 tests across 44 files, all passing** |
| Typecheck / lint / build | green (`pnpm -r run typecheck` + `tsc -p test/tsconfig.json`, `eslint .`, `next build`) |
| Dataset hash | `7588ce733b2119dfbf95b95b72741d37b1bacfd555e0369af96a29991e57af06` |
| Adversarial review | full tree, 12 lenses × 37 agents — 12 raw → **5 confirmed / 4 contested / 3 refuted**, all 9 fixed |

> The run id and output hash changed at `30494c0`: run identity now binds every
> controlled input `docs/16` names (it previously bound only the dataset hash, the
> policy version and the scenario flag). No financial figure moved — the locked
> aggregates are unchanged and the golden tests are untouched.

---

## P0 categories

A P0 release failure (docs/14) is a wrong balance, a wrong exception amount, a wrong blocker
count, fabricated evidence or AI conclusions, a NetSuite mutation, a permission bypass, a failed
deterministic baseline, or real/confidential data exposure.

| # | P0 category | Verdict | Evidence |
|---|---|---|---|
| 1 | Financial balances and control totals | **PASS** | `packages/data/test/controls.test.ts` (46), `packages/rules/test/golden.test.ts` (29), `packages/domain/test/goldenBaseline.test.ts` (6) — every locked total derived, none authored |
| 2 | Exception amounts, blocker count and exposure | **PASS** | `packages/rules/test/golden.test.ts` — 15 designed exceptions, 7 open / 8 resolved, 7 blockers, $198,950; `packages/rules/test/replay.test.ts` scenario resolution |
| 3 | No fabricated evidence or AI conclusion | **PASS** | `packages/ai/test/adversarial.test.ts` (25), `packages/ai/test/stage08-regressions.test.ts` (28), `apps/web/test/evidence-truthfulness.test.tsx` (10) |
| 4 | NetSuite read-only | **PASS** | `packages/services/test/services.test.ts` — adapter exposes no method that is not `get*`; `packages/services/test/stage07-queries.test.ts` — no command name matches `/post\|writeToNetsuite\|approveAdjustment/` |
| 5 | Permissions and SOD | **PASS** | `packages/services/test/security.test.ts` (17) — denial, self-approval, auditor scope, restricted content |
| 6 | Deterministic baseline | **PASS** | `packages/services/test/stage09-integrity.test.ts` — Reproduce Close returns MATCH from a seed rebuild; `packages/data/test/determinism.test.ts` — committed fixtures reproduce byte-for-byte |
| 7 | No real or confidential data | **PASS** | `test/synthetic-and-secrets.test.ts` (11) — no credential shape, no email address, no outbound URL, every named party invented by the dataset |

**No P0 is open.**

---

## Full acceptance matrix (docs/14)

| Check | Verdict | Evidence |
|---|---|---|
| SKU / location / classification totals, serial uniqueness, money precision | PASS | `packages/data/test/controls.test.ts`, `packages/domain/test/money.test.ts` |
| Dataset reproducibility and manifest | PASS | `packages/data/test/determinism.test.ts`; `pnpm --filter @icg/data generate` reproduces the committed fixtures |
| Every exception and golden scenario | PASS | `packages/rules/test/golden.test.ts`, `packages/rules/test/replay.test.ts` |
| Reconciliation and balanced proposed JEs | PASS | `packages/rules/test/replay.test.ts` (two balanced, never auto-posted), `packages/rules/test/stage07.test.ts`, `apps/web/test/stage07.test.tsx` |
| NetSuite read-only and source preservation | PASS | `packages/services/test/services.test.ts` |
| Native NetSuite vs close-control state | PASS | `apps/web/test/reconciliation.test.tsx` |
| Procurement and commercial chains | PASS | `packages/services/test/stage06-queries.test.ts`, `apps/web/test/reconciliation.test.tsx` |
| Financial Life of the unit | PASS | `apps/web/test/financial-life.test.tsx`, `packages/services/test/stage06-queries.test.ts` |
| Cycle-count source / variance / adjustment lineage | PASS | `apps/web/test/physical-count.test.tsx`, `packages/services/test/stage06-queries.test.ts` |
| Count population and the auditor-selection boundary | PASS | `apps/web/test/physical-count.test.tsx` — the 18 auditor selections are labelled externally supplied with no generation control, and management and auditor selections stay in separate tables |
| Evidence hashes, relationships, source health, fail-visible | PASS | `packages/services/test/security.test.ts`, `apps/web/test/evidence-truthfulness.test.tsx` |
| Workflow, SOD, period locks | PASS | `packages/services/test/security.test.ts`, `packages/services/test/services.test.ts` |
| PBC versioning and staleness | PASS | `packages/services/test/stage07-queries.test.ts`, `packages/services/test/stage09-integrity.test.ts` — every dependency slice invalidates exactly its own workpapers |
| Ask Gaurd hallucination / permission / prompt-injection / numeric / state | PASS | `packages/ai/test/adversarial.test.ts`, `packages/ai/test/golden-answers.test.ts`, `packages/ai/test/stage08-regressions.test.ts` |
| AI-off demo | PASS | `apps/web/test/stage09.test.tsx` — no provider is bound, the answer states so, and every figure comes from a tool result |
| Reset Demo | PASS | `packages/services/test/stage09-integrity.test.ts` — after evidence, comments, drafts, a review and a period lock, the reset re-derives every figure in `golden/baseline.json` |
| Clean install | PASS | `pnpm install` from the committed lockfile, then the four-command gate |
| Synthetic disclosure and public-data scan | PASS | `test/synthetic-and-secrets.test.ts` |
| Stale-reference scan (deprecated dataset names, completeness serial) | PASS | `test/stale-references.test.ts` (9) |

---

---

## Full-tree adversarial review (12 lenses, 37 agents, at `f3f6f98`)

Two skeptics per finding — one told to refute and to default to refuted when
uncertain, one told to reproduce the failure by running code. All four contested
findings were adjudicated real and fixed, so nine defects were remediated in `30494c0`.

**Eight of the twelve lenses examined their area and found nothing:** accounting math,
restricted-content disclosure, evidence lineage, the authored interpretations, the
read-only NetSuite boundary, permissions/SOD/auditor scope, the stage-09 surfaces, and
type-safety edge cases. That is a *result*, not an absence of coverage — the synthesis
agent sees only findings that survived verification, so its "coverage gaps" section
listed these same areas as unexamined. They were examined and cleared.

| Fixed | Where | Was it reachable? |
|---|---|---|
| A denied resolve-probe reported as NO_SUCH_OBJECT (P1) | `packages/ai/src/answers.ts` | **Yes, today, with no provider bound** |
| Finality vocabulary past the status guard | `packages/ai/src/guardrails.ts` | Latent — gates a provider; none is bound |
| Zero/nil/none past the quantity guard | `packages/ai/src/guardrails.ts` | Latent |
| Bare "signed"/"booked" past the action guard | `packages/ai/src/guardrails.ts` | Latent |
| Identified count rendered as "proposed", ×2 | `apps/web/lib/server/data.ts` | Yes — Overview GL panel and close-area note |
| Run identity binding only part of the version set | `packages/rules/src/close.ts` | Yes — a rule version bump reused a run id |
| MISMATCH that named no differing section | `packages/rules/src/close.ts` | Diagnostic only; verdict was always correct |
| A guarded assertion that passed when it found nothing | `apps/web/test/interaction-contract.test.tsx` | Test hygiene |

**Refuted and accepted as refuted (3):** a claim that the `.icg-kpis*` responsive regex
misses non-`icg-kpis` 4-column grids, and two others where the reproducer could not make
the failure occur. Recorded so they are not re-litigated.

**The one thin area:** no lens performed a real WCAG/keyboard/contrast audit. The a11y
lens checked the interaction contract (row activation, drawer focus, touch targets) and
test quality, which is narrower than accessibility. Worth a dedicated pass in stage 10.

---

## What the gate deliberately does not claim

- **Replay equivalence covers structured output only.** Thirteen sections are compared
  (`REPLAY_COMPARED_SECTIONS`); Ask Gaurd narration, working state and the audit trail are
  excluded by design (CANONICAL_SPEC §15). The exclusions are printed next to every result
  rather than left to the reader.
- **`SPEC_MANIFEST.json` is not enforced by any test.** It covers 44 spec files and must be
  recomputed by hand when one of them changes. Stage 10 edits the manifest-covered root
  `README.md`.
- **Auditor acceptance is not a state.** PBC readiness is a management preparation measure;
  nothing in this product records what an audit team concluded.
- **Nothing is posted.** `posted` is structurally `false`, `postedCount` is typed `0`, and no
  command service method writes to any source system.
- **`/evidence`, `/assumptions` and `/user-guide` remain the shell's not-designed state.**
  They are P2 in `docs/13`; the demo path does not traverse them.
