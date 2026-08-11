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
| Commit | `fb496a0` (pass-1 data remediation) + the pass-2 fixes landing with this record |
| Suite | **628 tests across 47 files, all passing** |
| Typecheck / lint / build | green (`pnpm -r run typecheck` + `tsc -p test/tsconfig.json`, `eslint .`, `next build` — 14 routes) |
| Dataset hash | `672d7349c616f47888c7bd28fdf13a844884b3eaf153d32e45b8d4676f1a5ab0` (post pass-1 data remediation) |
| Adversarial reviews | full tree at `f3f6f98` (12 lenses / 37 agents → 9 fixed); stage-10 public-surface fleet at `e3c952e` (7 lenses / 76 agents → 27 fixed); final data passes at `fa3526b`/`fb496a0` (49 + 42 agents — see the Final data passes section) |

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

## Stage-10 public-surface verification (7 lenses, 76 agents, at `e3c952e`)

The dedicated pass the full-tree review owed: public-copy boundaries, README truthfulness,
WCAG/keyboard/contrast, responsive degradation at real viewports, the demo path, and
deployment readiness. 34 raw findings → 20 confirmed, 9 contested (7 adjudicated real),
5 refuted. All 27 real defects fixed in `1c85866`. The synthesis named the pattern:
**the repository's claims were more precise than its enforcement** — every defect was a
document, copy string, or stylesheet asserting a guarantee the tree did not mechanically
hold. Nothing was found against a financial figure, a permission, or a determinism claim.

The load-bearing fixes: the README and the Ask Gaurd availability note both attributed
*conclusions* to software (the one boundary the product defines itself against — both were
single-word edits); half the credential scan named config files that did not exist and
`collect()` swallowed the miss; the SYNTHETIC DEMO disclosure rendered under the header
KPIs at 1366×768; the sign-off gate's six headline figures rendered at zero width on a
phone; all 13 nav links were nameless below 1280px (WCAG 4.1.2 Level A); and the `<1024`
read-only rule was defeated by an inline style — and then nearly again by the fix's own
selector specificity, which is why the regression pins the mechanism, not the instance.

**Still open, deliberately (P2):** the Ask Gaurd drawer behaves modally (tab trap) but
carries `complementary` semantics with no `aria-modal`/`inert` — the stage-05 interaction
contract pins the current shape, so this needs a design decision rather than a patch.
Git history was verified clean of credential shapes (`git log --all -p`), but the
permanent scan covers only the working tree.

---

## Final data passes (owner request, 2026-08-10)

The two passes requested before the repo goes public: one last adversarial pass at the
fixture corpus itself, then a validation of every result the demo leads with. Working
method for both: finder lenses → dedupe → two skeptics per finding (one told to refute
and default to refuted, one told to reproduce by running code) at high effort, contested
findings adjudicated inline.

### Pass 1 — adversarial data pass (8 lenses, 49 agents, at `fa3526b`)

The four areas no fleet had ever swept: cross-fixture referential integrity in both
directions, per-serial story coherence for the ~1,485 background units, operational
timeline realism, and fixture content vs what the screens humanize — plus the derived
close vs spec. 27 raw findings → 20 deduped → **11 confirmed, 9 contested (1 adopted,
8 refuted), 0 unverified**. Ten defects fixed in `fb496a0`, each with a category-level
regression (`packages/data/test/pass1-regressions.test.ts`,
`apps/web/test/pass1-classification.test.ts`):

| Fixed | Class |
|---|---|
| The 28 sold-chain serials had no buy-side documents at all — false "missing acquisition" stories | dangling-reference (P1) |
| Background loaners swept into another customer's fleet install, some loaned after "installation" | cross-fixture-conflict (P1) |
| Movements MV-001..003 dated pre-snapshot but reflected in no book or count position | phantom-movement (P1) |
| 15 outbound-GIT units picked up by the carrier before their book movement into transit | impossible-timeline (P1) |
| Installed/assigned units' `lastMovementAt` uncoordinated with install/assignment dates | impossible-timeline (P1) |
| 40 of 41 test counts citing a bin contradicting the same count's listing row | trace-contradiction (P2) |
| Cycle-count quantities as pure PRNG noise, including counting stock not yet acquired | infeasible-quantity (P2) |
| 41 of 42 test counts sharing two identical instants, rendered on the count screen | uniform-timestamp (P2) |
| GIT/RMA classifications title-cased into "Git"/"Rma" on Financial Life | enum-unmapped (P2) |
| Two January vendor bills numbered `VB-26-*`; identical transit fingerprints jittered | id-date-mismatch / uniform-gaps (P3) |

Refuted on adjudication, recorded so they are not re-litigated: FP-88221's empty serial
list (schema-forced for an all-batch shipment; the schema records serial trails only for
serialized SKUs), inbound `acquiredAt` trailing carrier pickup (ordinary booking lag, not
an impossible ordering), RMA returns without outbound history and undocumented
damaged-hold stock (documented sparse-sampling design; `VAL-DMG-001` states it in code),
background demo assignments without contracts (only the LOANER rule requires one), the
August "recount scheduled" wording (September re-covers 9 of 11 cells), the
`nextCountDue` cadence (the designed overdue example plus an authored year-end clamp),
and the golden file's 16-field scope (every derived aggregate is gate-checked in
`golden.test.ts`).

The dataset hash moved to `672d7349…` because background fixture content changed;
**no locked total moved** — the 46 control tests, 29 golden tests, and 6 golden-baseline
tests pin every one.

### Pass 2 — highlight-set validation (8 verifiers, 42 agents, at `fb496a0`)

Every figure and claim the demo leads with, checked two ways: (a) re-derived from the
fixtures through `buildDataset → toCloseInput → runClose`, (b) read on every surface
that states it (fixtures → rules → services → screens → README → this file → User
Guide → docs/CANONICAL_SPEC → golden/baseline.json).

**All eight item groups derive exactly, and no two surfaces disagree on any number.**
81.42% / 8142 bps readiness with all eight category scores derived from tier rules;
15 exceptions 7 open / 8 resolved; 7 blockers / $198,950; $255,650 exposure;
$4,812,450 − $4,800,000 = $12,450 with the three reconciling items netting to the
adjusted $4,800,000; adjustments 3 identified / 2 drafted / 0 posted; PBC 17/21 = 80.95%
with the corrected attention set; source health 91.67%; 1,500 book units / 1,065 count
population / 1,061 matched / 4 variances / 6 movements / 24+18 test counts; and the
EXC-001 signature story fact-for-fact from SO-26184 through INV-2027-00418 to
CUT-OUT-001 REVIEW_REQUIRED and conclusion Open. **Reproduce Close returned MATCH** over
the fourteen compared sections, and **Reset Demo restored every highlight figure** after
evidence, comments, drafts, a review and a period lock. The four boundary claims verified
mechanically true and consistently worded.

17 findings → **12 confirmed, 5 refuted on adjudication, 0 unverified**. Every confirmed
finding was wording or record staleness — none was a figure: this file's stale header and
"thirteen sections" literal, SESSION_HANDOFF's stale rows and its four-noun stage-08
bullet, a dead pre-formatted readiness string in the web view-model, the four-noun header
comment in `answers.ts`, and the three-noun wording pact having no test. All fixed with
this record; the pact is now pinned by `apps/web/test/pass2-wording-pact.test.ts`.

### Register of documented conflicts (none blocking)

Deliberately not fixed — each would change canonical spec wording or a locked total:

1. **EXC-001 count rows vs the locked count baseline (P1, spec-internal) —
   ACCEPTED by the owner, 2026-08-10, as a documented tension. No data or spec change.**
   CANONICAL_SPEC §6 locks first pass at 1,061 matched / 4 variances over the 1,065
   population; §8 locks the EXC-001 pair delivered 12/29 and installed 12/30 with book
   location still Warehouse. Because the book location puts the pair in the count
   population, the fixtures are forced to record them as physically found in the
   warehouse at the 12/31 snapshot (`CD-0512`/`CD-0513`) — two days after installation
   at the customer. Counting them missing (the physically true outcome) would make the
   first pass 1,059/6, give EXC-001 count-variance support §6 does not grant it, and
   surface the pair as new CNT-EX-001 exceptions — changing the exception count,
   blocker count and readiness. Rationale for acceptance: no screen juxtaposes the two
   facts; the count rows are readable as a book-listing tick-off (a count team checking
   listed serials rather than blind-counting — itself a realistic control weakness that
   sits beside, and does not contradict, EXC-001's designed book-lag story); and every
   alternative moves locked values. A fixture reader who spots it is looking at a
   recorded, reasoned decision rather than an oversight.
2. **§1 vs §11/docs on the Overview headline precision (P3).** §1 says the Overview must
   "immediately show 81.42%"; docs/11, docs/12, the approved design export and the
   shipped headline all use the one-decimal overview scale "81.4%" (the exact
   "81.42% · 8142 bps" reads two lines below on the same screen).
3. **§5 vs §9 on the EXC-014 item label (P3).** §5 calls the reconciling item "validated
   receipt timing"; §9's locked exception table and the derived rule title both say
   "PO/receipt/GL timing", which is what the bridge renders.

---

## What the gate deliberately does not claim

- **Replay equivalence covers structured output only.** Fourteen sections are compared
  (`REPLAY_COMPARED_SECTIONS` — thirteen from stage 09 plus `ruleResults`, which joined at
  `30494c0`); Ask Gaurd narration, working state and the audit trail are excluded by design
  (CANONICAL_SPEC §15). The exclusions are printed next to every result rather than left to
  the reader.
- **`SPEC_MANIFEST.json` is not enforced by any test.** It covers 44 spec files and must be
  recomputed by hand when one of them changes. Stage 10 edits the manifest-covered root
  `README.md`.
- **Auditor acceptance is not a state.** PBC readiness is a management preparation measure;
  nothing in this product records what an audit team concluded.
- **Nothing is posted.** `posted` is structurally `false`, `postedCount` is typed `0`, and no
  command service method writes to any source system.
- **`/evidence` and `/assumptions` remain the shell's not-designed state.** They are P2 in
  `docs/13`; the demo path does not traverse them. `/user-guide` was built in stage 10 —
  the rail's START HERE badge now lands on a real page.
