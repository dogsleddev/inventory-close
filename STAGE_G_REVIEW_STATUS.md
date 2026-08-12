# Stage G review — status

**Written 2026-08-12, mid-review; updated 2026-08-12 after the first fix pass.** The org hit its
monthly spend limit during the verification fleet. This document is the complete state: what is
committed, what the review established, what it did not reach, where every artifact lives, and how
to resume without repeating any of it.

> Read this before `STAGE_G_REVIEW_PLAN.md`. The plan is still the method; this is where the method
> got to.

---

## 0. What the first fix pass closed (`1e06d58`)

**Eight findings are fixed and committed**, each with a regression asserted as a biconditional
against the service on the same run, and each mutation-tested against the pre-fix HEAD:

| id | sev | what changed |
|---|---|---|
| `G66` | P0 | **Verified by hand first, and it held.** `get_evidence_timeline` now carries an unscoped `exists` per row and tests it before any other branch, so no row of any state can assert an event the close does not contain. The auditor's KE-X1-9025 drawer went from 4 withheld components to 3; the spurious `Delivery · FP-IN-2291` row is gone. |
| `G24` | P0 | `get_effective_close` added; `blockers` answers from the live close and branches its status on the count. The baseline is still reported, named as the baseline, and only once it differs. |
| `G25` | P0 | `get_exception_workflow` added; `answerException` reads the recorded conclusion and the live unmet requirements. Three states, not two — the old sentence asserted both that no conclusion existed and that none could be reached. |
| `G40` | P0 | Number agreement moved into the compiler (`numberForms`). **This also closes `G39` and `G42`** — same defect, other words. |
| `G01` `G02` `G03` | P1 | The procurement scope note is derived per tab from that tab's own population, and points below itself. |
| `G46` | P0→NOTE | The requirements gate is now enforced against the state as well as the write. **Severity corrected — see §3c.** |

Incidentally closed by the same edits: `G39`, `G42` (the compiler change), and `G16`'s
blockers-branch half.

**Gate after the pass:** typecheck, lint and build clean, 20 routes. **2,119 tests across 72 files
passing** (was 1,749). Locked baseline unmoved and re-confirmed in a browser as Controller and
auditor. `pnpm test` still exits 1 on the known `onTaskUpdate` reporter RPC timeout — read the
`Tests` line.

> **Run the suite with `--maxWorkers=3`.** At default concurrency vitest now OOMs on this machine
> (`AlignedAlloc Allocation failed`, ~3 s in, at 64 MB heap — system memory, not heap limit).
> `npx vitest run --maxWorkers=3` completes in ~4 min.

**Everything else below is still outstanding.**

---

## 0b. The re-verification pass (§8 step 3+4, done)

**All 68 remaining findings were re-judged at HEAD** by 12 agents, one per themed cluster —
1.62M tokens, 12 of 12 returned, **no dead clusters and no unreturned ids**. Verdicts:

```
HOLDS 64   REFUTED 3   ALREADY_FIXED 1   UNCERTAIN 0
HOLDS by severity at HEAD:   P1 15    P2 29    NOTE 20
Severity moved:  1 raised, 10 lowered
```

**The calibration correction worked.** Three real refutations against zero last time, and severity
moved *down* ten times to one up — the opposite direction from the previous run, which raised nine.
The refutations are substantive, not procedural: `G64` was killed by measuring the actual painted
layout (chip text ends at x=1228 inside a container ending at 1236; every scroll container reports
`scrollWidth === clientWidth`), `G55` and `G54` by showing no shipped path can reach the code.

What made the difference, for the next run: the burden was stated **once, symmetrically**, with no
warning against either pole — warning against one installs the other. `ALREADY_FIXED` was offered as
a first-class verdict, and the prompt quoted §3c's failure verbatim and required the verdict field
to match the reasoning.

**The pass found a defect in the fix pass — `G67`, and it was mine.** `1e06d58` rewrote the
procurement scope note, branched two phrases by hand, and carried a third hard-coded `orders`
through its own closing sentence. The agent proved it with `git blame`, which named the fix commit
as the author of the surviving instance. Fixed in `dee2580`; the regression drives the note builder
across counts rather than reading the page, because the shipped population is 84 orders and the
defect only shows at one — which is exactly how it survived a rewrite whose author was looking
straight at it.

**Two findings bore directly on the compiler change. Both are now FIXED (`9ef075c`):**

- `G75` — the `[\s-]+` word join was one-directional. `phrasePattern` split on `/\s+/`, so an
  authored *space* matched a hyphen but an authored *hyphen* did not match a space: `sub-ledger`
  compiled to `(?:sub-ledgers|sub-ledger)` and "What is in the sub ledger?" refused. Seven other
  hyphenated phrases were covered only because an author hand-listed the spaced twin — **the
  allowlist standing in for a compiler property, the same shape number agreement had just been moved
  off, one axis over.** Now splits on `/[\s-]+/`; inflection still lands on the head noun because
  the last segment is the last element either way. **One routing change across a corpus of 1,375**
  (every phrase in both spellings, plus every shipped chip): `sub ledger`, UNROUTED → reconciliation.
- `G74` — `phrasePattern` folded curly punctuation on the question side and never on the phrase side.
  Now folds the phrase through `normalizeQuestion` — the same function, not a second spelling of it.
  **Folding cannot undo mojibake**, though: a Get-Content round trip turns the apostrophe into three
  characters the fold set has never heard of, so `phrase === normalizeQuestion(phrase)` would still
  pass on it. The guard that works is **ASCII**, asserted over every declared phrase.

  Worth keeping: three OTHER tests also failed on a corrupted phrase, because they built their probes
  from the raw phrase — so an encoding fault reported itself as a boundary fault and as a number
  fault. Each now segments the way the compiler segments, and a corrupted phrase fails exactly one
  test, which names the cause.

**The largest remaining cluster is still the baseline-versus-live family**, and it is confirmed to be
the same two tools away: `G26`'s agent observed that `1e06d58` "added exactly the tool that would
close this… `answerException` was rewritten to use it. The `missing-evidence` intent was not." The
repository now holds, side by side, one handler reporting the live working state and another
reporting the frozen one for the same exception — and both shipped evidence chips route to the
second. `G26`, `G27`, `G29`, `G30` are P1 at HEAD; `G28` was lowered to P2.

Per-agent output with full reproductions:
`.claude/projects/C--dev-Inventory-Close/<session>/subagents/workflows/wf_8b945fa1-a99/journal.jsonl`

---

## 1. Where the code stands

**HEAD is `1e06d58`** — Stage G (`7333663`), the remediation of the review plan's own §0
(`003525a`), the review status record (`e696caf`), and the first fix pass (`1e06d58`).

---

## 2. What the review ran

Two workflows, following `STAGE_G_REVIEW_PLAN.md` §1 and the corrected method in
`SESSION_HANDOFF.md`.

| | Agents | Result | Tokens |
|---|---|---|---|
| **Workflow 1** — 14 finder lenses | 14 of 14 completed | **96 raw findings**, 180 areas examined-and-cleared, 86 could-not-check items | 2.88M |
| **Workflow 2** — dedupe + skeptics | 91 of 139 completed; 48 died on the spend limit | 96 raw → **78 groups**; **48 confirmed**, 30 unjudged | 6.72M |

Eleven lenses came from the plan. Three were added:

- **Lens 12 reviewed the remediation commit `003525a` itself.** The pass over Stage F's remediation
  had found a P1 in code written by the session that had just fixed 26 defects, and `003525a` was
  written by the session that commissioned this review — so an independent pass over it was the
  highest-value slot available. It found six items; three are confirmed (§4).
- **Lens 13** covered the plan's own admission that nobody audits `matching.ts` for **false
  negatives** — the risk Stage G created by rewriting every pattern. It produced a confirmed P0.
- **Lens 14** took the plan's §2 coverage-gap list, headed by `export-csv.ts` and
  `projections.ts`'s per-projection authorization.

Both runs were write-free: `git status --porcelain` was empty after each, and no agent left an
artifact in the repository.

---

## 3. The tally, and what it does NOT mean

```
96 raw findings  →  78 deduped groups  →  48 CONFIRMED / 30 unjudged
                                          0 refuted, 0 contested, 0 genuinely uncertain

Confirmed by severity, as re-judged by the skeptics rather than as claimed by the lens:
  P0   4       P1  26       P2  11       NOTE  7
```

**Two caveats, and the first is serious.**

### 3a. Every single verdict was CONFIRMED. Treat the verification pass as weak.

90 individual skeptic verdicts came back. **All 90 said CONFIRMED.** Not one refutation, not one
uncertain. That is not a plausible distribution for an adversarial pass, and it means the second half
of the method did not do its job. The likely cause is my own prompt: its calibration section warned
at length against the *previous* run's failure (a skeptic told to default to refuted), and in
correcting that bias appears to have installed the opposite one.

They were not purely rubber-stamping — severities moved in both directions. Nine findings were
raised from P2/NOTE to P1 (`G11`, `G14`, `G15`, `G22`, `G29`, `G30`, `G34`, `G41`, `G44`), four were
lowered from P2 to NOTE (`G09`, `G16`, `G23`, `G31`), and many carry a `correctionToTheClaim` that
narrows the lens's framing. So the pass has real value as **severity triage and claim correction**.
It has little value as **falsification**.

**What to do about it:** before acting on the long tail, re-verify with a genuinely
refutation-seeking skeptic — one whose stated job is to kill the finding, carrying the burden of
showing what happens instead. Least likely to be affected: the four P0s, and anything two
independent lenses reached by different routes (`G40` via L7+L13; `G01`, `G02`, `G03`, `G04` via
L1+L11+L12). Most in need of re-testing: findings resting on one lens and one confirming pair.

### 3c. It is worse than a bias — a skeptic argued its way to a refutation and still voted CONFIRMED

Found while fixing, and it sharpens §3a rather than repeating it. **`G46`'s consequence-angle
skeptic wrote, in its own `correctionToTheClaim`: "No reader can see this… There is no false figure,
no false accounting claim and nothing a reader would act on wrongly. Not P0, and not P1 either —
nothing misleading reaches a reader on a real path." It then returned `CONFIRMED`.**

The reasoning was right: `reviewEvidence` is exposed by no server action anywhere in `apps/web`, the
sole API route is GET-only, and `submitEvidence` hard-codes `PENDING` — so no submission in the
running product can ever reach `RETURNED`, which is the only way `unmetRequirements` can regrow
after a conclusion. `G46` is a latent invariant hole, not the reader-facing P0 the tally records.

So the verdict field did not merely lean confirming; **it was decoupled from the analysis
underneath it**. Any re-verification must read `mech.correctionToTheClaim` and
`cons.correctionToTheClaim` rather than the `status` field — the reasoning in this run is worth
far more than the vote attached to it. Two of the 48 "confirmed" may be this shape; the corrections
are the place to look.

It was fixed anyway, because the fix is three lines and `COMPLETION_PLAN.md:168` plans the
`reviewEvidence` button that would open it. Severity is recorded here as NOTE, not P0.

### 3b. The 30 unjudged are NOT low-severity leftovers

The workflow's own return value called them `uncertain: 30`. They are not uncertain — **their
skeptics never ran.** Every agent on those groups died on the spend limit. Among them are **one P0
and two P1s**, and the P0 is a finding against the remediation commit. The severity shown for an
unjudged group is the lens's unreviewed claim.

This is the result-shaping trap from the project's own notes, one stage later: a dead agent needs its
own bucket, or the findings that matter disappear into a benign-sounding count. They are listed in
full in §6.

---

## 4. Findings against the remediation commit `003525a`

Separated out because they are defects in the fix, and because the session that wrote the fix
commissioned the review.

| id | severity | status | what it says |
|---|---|---|---|
| `G01` | P1 | **CONFIRMED** | `procurementScopeNote` tells an auditor the GRNI and price-variance row sets are short. They are byte-identical to the Controller's — same POs, same 42 units, same $18,600. The withheld order is `INVOICED_NOT_RECEIVED` so it could never be a GRNI row, and the withheld document sits on `PO-26-1201`, which appears in none of the three displayed populations. **A fix that reopened the class it closed:** the plan told the author GRNI was *not* short and to record it as latent risk; the fix shipped prose asserting it is short. |
| `G02` | P1 | **CONFIRMED** | The same false withheld-document clause on a third intent — invoiced-not-received promises a withheld document on a row above, and none of `PO-26-1241/1242/1243` carries one. |
| `G03` | P1 | **CONFIRMED** | The rewritten `withheldNote` renders above **all five** Procurement tabs and is false on three of them — and says "the table above" while sitting *above* every table. |
| `G66` | **P0** | **unjudged** | The §0.5(a) fix "guards the wrong term": `Delivery · FP-IN-2291 — withheld by your access scope` is still printed over a delivery that has not happened, now to `AUDITOR_READ_ONLY` on `KE-X1-9025`, beside `Components withheld from you: 4`. If it holds, the fix narrowed the defect instead of removing it. **Verify this first.** |
| `G67` | NOTE | unjudged | The commit that removed a hard-coded plural added two more, in the sentences that replaced it. |
| `G68` | NOTE | unjudged | The invoiced-not-received tab note still names EXC-002 by identity while its new guard only tests that *some* row carries *some* open exception. |
| `G69` | NOTE | unjudged | Five of the seven new withheld strings are unreachable at dataset v1.2.0. |
| `G70` | NOTE | unjudged | `ProcurementDocumentKind` is not exported from `@icg/services` and cannot express the third leg its own doc comment claims. |
| `G71` | NOTE | unjudged | The `checkDraft` drop path would file the engine's own self-censorship as missing *required evidence*. |

Three of the confirmed defects share one shape: **the sentence added to disclose a restriction
over-claims what the restriction touched.** The remediation fixed "scope rendered as absence" and
introduced "scope rendered as a finding" in its place, on a narrower path.

---

## 5. The 48 confirmed findings

Ordered by re-judged severity, then id. `lens` names which lenses reached the finding independently —
two or more is strong corroboration. `what a reader sees now` is truncated; the full record,
including the reproduction that was actually run and its real output, is in the artifact directory
(§7).

| id | sev | finding | file | lens | what a reader sees now |
|---|---|---|---|---|---|
| G24 | P0 | Four intents report the frozen baseline — seven blockers, $198,950, 81.42% — as the present close | `packages/ai/src/answers.ts` | L4 | Drawer, answering the shipped chip "What prevents sign-off?" (ExceptionsScreen.tsx:50, CloseMemoScreen.tsx:126, OverviewScreen.tsx:53, UserGuideScreen.tsx:249) — STATUS "Sign-off is blocked"; "Open blockers = 7"; "Close readiness = 81.42%";… |
| G25 | P0 | answerException says "No conclusion has been recorded" beside a recorded conclusion | `packages/ai/src/answers.ts` | L4 | Exception detail drawer, answering the shipped chip "Why is KE-E2-1048 still open?" (ExceptionDetailScreen.tsx:64-69) — STATUS "Waiting on Contract"; MISSING "Ownership/acceptance contract provision — not in evidence. It cannot be inferred;… |
| G40 | P0 | "price variances" (plural) is answered by the physical-count handler | `packages/ai/src/answers.ts` | L7,L13 | "1,061 of 1,065 units matched on the first pass" — with managementConclusion "Cycle-count history is a management risk lens. It is not auditor sampling and carries no reliance.", nextAction "Resolve the open count variances; each is an exce… |
| G46 | P0 | A RESOLVED conclusion survives the return of the record that satisfied it, and sign-off is then offered and recorded | `packages/services/src/commands.ts` | L8 | Overview sign-off panel: "Every blocker has a management conclusion. Signing off locks the period." beside "0 blockers · $0" and readiness "96.8%". On clicking: "Management sign-off recorded. The period is locked; reopening it requires a st… |
| G01 | P1 | procurementScopeNote tells the auditor complete GRNI and price-variance row sets are short | `packages/ai/src/answers.ts` | L1,L12 | On "Is there any purchase price variance this year?" and "What have we received but not been invoiced for?" the auditor's drawer prints, under MISSING EVIDENCE: "1 of the close's 84 orders is outside your access scope, so it does not appear… |
| G02 | P1 | invoiced-not-received promises a withheld document on a row above that has none | `packages/ai/src/answers.ts` | L12 | Ask Gaurd, U-009 (AUDITOR_READ_ONLY), "Which purchase orders were billed but not received at year-end?" — MISSING EVIDENCE item 2, verbatim: "1 source document is withheld on an order that does appear above. Each such row names the withhold… |
| G03 | P1 | The Procurement withheldNote renders above all five tabs and is false on three of them | `apps/web/lib/server/procurement-view.ts` | L1,L12 | An auditor on the Price Variance tab (and on Received Not Invoiced, and on Goods in Transit) reads, in the panel above the table: "1 order is outside your role's scope in this demo, so it has no row in the table above. The match figures cou… |
| G04 | P1 | Access-scope withholding is rendered in the drawer's MISSING EVIDENCE channel and counted as missing evidence | `apps/web/components/AskGaurd.tsx` | L1,L11 | For the auditor, on five of the shipped questions, the drawer renders a section headed "MISSING EVIDENCE" in `var(--ember)`, each entry prefixed with a "○" bullet and suffixed for assistive tech with " — missing, required", and the live reg… |
| G05 | P1 | Auditor memo headline says "Nothing drafted and nothing issued" about a draft the same answer says is withheld | `packages/ai/src/answers.ts` | L1 | AUDITOR status (drawer headline): "Nothing drafted and nothing issued". Three blocks lower, under MISSING EVIDENCE: "1 unissued draft is withheld from this role. A draft is internal management working paper. ..." |
| G06 | P1 | getMemo withholds the draft on a role literal, so four non-management roles read the draft body | `packages/services/src/memo.ts` | L3 | For U-005 WAREHOUSE and U-008 LEGAL the memo view payload contains draft.body verbatim, and the Version History tab renders the draft's title: "Working draft · <date> / INTERNAL — reserve exposure, do not circulate / M. Reyes · Controller /… |
| G07 | P1 | memo-draft says the issued version's position is the one shown and never reads positionMoved | `packages/ai/src/answers.ts` | L2,L4 | Close Memo screen chip "What prevents sign-off?"/"Draft the close memo for me." — STATUS "Version 1 issued; the close position is the one below", followed by the live figures "Open exceptions = 6", "Close readiness = 83.58%", and missingEvi… |
| G08 | P1 | The reconciliation EXPOSURE tile is labelled "Unreconciled difference" and carries the whole GL difference | `packages/ai/src/answers.ts` | L2 | Ask Gaurd, EXPOSURE section: "$12,450" / "Unreconciled difference". Three lines above, in the same answer: "Every dollar of the difference is identified and attributed." |
| G11 | P1 | reconciliation asserts EXISTENCE and COMPLETENESS where all three cited exceptions assert ACCURACY | `packages/ai/src/answers.ts` | L2 | "Why doesn't inventory tie?" drawer — ASSERTIONS: "Existence", "Completeness"; citations EXC-009, EXC-014, EXC-015. Open EXC-015 from that citation list and its own drawer reads ASSERTIONS: "Accuracy". |
| G14 | P1 | unit-conflicts says every open item "carries evidence that conflicts" | `packages/ai/src/answers.ts` | L2 | Status: "7 open items carry evidence that conflicts". Under the heading CONFLICTING EVIDENCE (apps/web/components/AskGaurd.tsx:187), among the seven: "NetSuite records 14 units … The year-end custodian confirmation requested 2026-12-28 has … |
| G15 | P1 | answerException prints the rule's absence narrative under CONFLICTING EVIDENCE, keyed on `open` alone | `packages/ai/src/answers.ts` | L2 | EXC-007 drawer — CONFLICTING EVIDENCE: "NetSuite records 14 units totaling $92,400.00 as company inventory held by Redwood Installation Services. The year-end custodian confirmation requested 2026-12-28 has not been answered, so existence a… |
| G18 | P1 | humanizeCanonical corrupts the dataset version to "FY2026-Demo-v1.2.0" | `apps/web/lib/server/ask-view.ts` | L3 | Ask Gaurd drawer, provenance answer: Dataset  FY2026-Demo-v1.2.0 |
| G19 | P1 | routeQuestion's "the two cannot disagree" — answerQuestion never calls it | `packages/ai/src/answers.ts` | L3 | The stage's own doc: "Exported for the routing harness AND used by `answerQuestion`, so the two cannot disagree about what the table says. It is not the whole story — `answerQuestion` falls back when an intent matches and produces nothing —… |
| G22 | P1 | projections.ts claims all ten delegates scope source documents; seven do not | `packages/services/src/projections.ts` | L3 | The stage's own doc, on the module that is the permission boundary for Ask Gaurd: "Every function delegated here already calls `authorize(ctx.user, …)` and scopes source documents itself. This layer adds no logic of its own." |
| G26 | P1 | missing-evidence reports submitted and accepted records as "not in evidence" | `packages/ai/src/answers.ts` | L4 | Evidence screen chip "Which evidence is still missing?" (EvidenceScreen.tsx:54, OverviewScreen.tsx:56) — STATUS "8 required items of evidence outstanding", eight rows each "= Not in evidence", eight MISSING lines beginning "EXC-001: Ownersh… |
| G27 | P1 | "8 of 15 exceptions carry a recorded resolution" counts rule status, not recorded resolutions | `packages/ai/src/answers.ts` | L4 | Exceptions screen chip "Which exceptions are resolved?" (ExceptionsScreen.tsx:50) — STATUS "8 of 15 exceptions carry a recorded resolution", eight rows EXC-005…EXC-014, CONCLUDES "A resolution is a recorded event, not an absence of findings… |
| G28 | P1 | The drawer has no divergence disclosure, so two closes appear unlabelled one click apart | `packages/ai/src/answers.ts` | L4 | In one drawer, one session, one click apart: "Sign-off is blocked / Open blockers = 7 / Close readiness = 81.42%" (blockers, get_close_readiness) and "Open exceptions = 6 / Blockers = 6 / Close readiness = 83.58%" (memo-draft, get_memo). Al… |
| G29 | P1 | buildOverviewData's blocker counts are baseline while the rows they caption are live | `apps/web/lib/server/data.ts` | L4,L8 | Panel "Preventing Sign-Off" / "Each item needs a management conclusion. Ordered by exposure.", header right: "of $198,950 across 7 blockers", table body empty, footer: "All seven blockers shown." and "View all 7 blockers →". After concludin… |
| G30 | P1 | pbc prescribes a conclusion for close items already concluded | `packages/ai/src/answers.ts` | L4 | "How ready is the audit package?" — MISSING "PBC-008 is waiting on EXC-001 — a close conclusion, not preparation effort.", NEXT "Conclude the close items the remaining workpapers depend on." |
| G32 | P1 | The auditor's timeline loses two withheld records entirely and reports nothing withheld | `packages/ai/src/tools.ts` | L6 | AUDITOR_READ_ONLY, drawer on KE-Y1-1845, "Walk me through this unit's financial life." — the whole answer is: SKU KE-Y1 / Carrying value $12,800 / NetSuite location Customer Site / "Purchase Order :: PO-25-3035 · 2025-10-18" / "Item Receipt… |
| G34 | P1 | Three handlers absorb a NOT_AUTHORIZED tool call into an answer | `packages/ai/src/answers.ts` | L6 | With `searchSerial` denied and `getFinancialLife` allowed, the drawer answers "Financial life of KE-E2-1048" and "KE-E2-1048 is named by 1 exception" with no mention of the denial; with `getException` denied, "What conflicts at year-end?" o… |
| G37 | P1 | The screen's scope silently outranks the record the question names | `packages/ai/src/answers.ts` | L7 | From KE-E2-1048's Financial Life page (`askScope: { serial: data.serial }`, `askContext: "KE-E2-1048 · Financial Life"`), asking "Walk me through KE-X1-9025's financial life." renders: `Financial life of KE-E2-1048` / `SKU = KE-E2` / `Carry… |
| G39 | P1 | "third-party confirmations" (plural) is answered by the custody handler | `packages/ai/src/answers.ts` | L7 | "Are all third-party confirmations in?" → `1,500 book units across 9 custody types`, thirteen custody figures, `missingEvidence: []`, and the conclusion "Custody is who holds the goods; ownership is who carries them. Every book unit is plac… |
| G41 | P1 | "not resolved" is answered with the resolved population | `packages/ai/src/answers.ts` | L7 | "Which exceptions are not resolved?" and "What has not been resolved?" both → `8 of 15 exceptions carry a recorded resolution`, listing `EXC-005 — Count variance = Resolved — No Adjustment`, `EXC-006 = Resolved — No Adjustment`, `EXC-008 = … |
| G42 | P1 | Plural phrasings refuse OUT_OF_SCOPE across seven intents whose singulars answer | `packages/ai/src/answers.ts` | L7,L13 | "Ask Gaurd answers from the close's own structured data. It cannot answer this from what the tools return, and it will not guess." (refusal.reason = OUT_OF_SCOPE, answer undefined, route = unrouted) |
| G44 | P1 | "Which count issues are still open?" answers 4 where 1 is open | `packages/ai/src/answers.ts` | L7 | PhysicalCountScreen chip "Which count issues are still open?" (line 81) → `1,061 of 1,065 units matched on the first pass` / `Variance rows = 4` / next action "Resolve the open count variances; each is an exception of its own." No issue is … |
| G10 | P2 | answers.ts's Stage G note claims no management conclusion is merely "true today" — two are | `packages/ai/src/answers.ts` | L2 | answers.ts:59-62: "a sentence saying 'these agree' is emitted from the service's own measured boolean, and its opposite is emitted when the boolean is false. None of them is a statement of fact that happens to be true today." |
| G12 | P2 | third-party prints the raw confirmation enum "REQUESTED" and words the same field three lines later | `packages/ai/src/answers.ts` | L2,L9 | KNOWN FACTS: "Redwood Installation Services — confirmation" = "REQUESTED". MISSING EVIDENCE, in the same answer: "Year-end confirmation from Redwood Installation Services (requested, not returned) — existence and rights at the custodian are… |
| G17 | P2 | "is missing 1 required component(s)" — hard-coded plural in procurement-chain | `packages/ai/src/answers.ts` | L2,L7,L9,L11 | MISSING EVIDENCE, for nine of the ten demo roles, on both "Which chains are missing required components?" and "Why can a native match pass while the close stays open?": "○ SO-26101 is missing 1 required component(s)." — seven of the eleven … |
| G20 | P2 | CUSTODY_HOLDER reaches the drawer raw because the code-constant exemption outranks a label the map has | `apps/web/lib/server/ask-view.ts` | L3,L9 | Ask Gaurd drawer, on the chip that ships on MethodologyScreen.tsx ("Which parts of this product are judgements rather than derivations?"), rows 37–49 of 58: label "CUSTODY_HOLDER — Company warehouse", value "The company · held in CUSTODY_HO… |
| G21 | P2 | Single-word canonical vocabularies are unworded, and the only token guard's regex cannot see them | `apps/web/lib/server/ask-view.ts` | L3,L9 | Ask Gaurd drawer, "Which sources are not healthy?": figures "AccordVault => STALE", "ReturnLoop => PARTIAL", "NetSuite ERP => HEALTHY", and in the missing-evidence list the sentence "AccordVault is STALE — Document index sync failing since … |
| G33 | P2 | Withheld timeline rows are appended after the dated ones, reordering the chain of custody | `packages/ai/src/tools.ts` | L6 | AUDITOR_READ_ONLY, drawer on KE-X1-6904, in this order: "Purchase Order :: PO-26-1201 · 2026-12-12", "Vendor Bill :: VB-26-2431 · 2026-12-31", "Item Receipt :: IR-26-2214 · withheld by your access scope", "Components withheld from you :: 1"… |
| G38 | P2 | Identifier extraction reads the raw question while matching reads the normalized one | `packages/ai/src/answers.ts` | L7,L13 | "Walk me through KE–E2–1048's financial life." (en dash, i.e. pasted from a memo or produced by Word autocorrect) → `Outside what Gaurd can answer` / "Ask Gaurd answers from the close's own structured data. It cannot answer this from what t… |
| G43 | P2 | "When was this serial last counted?" is answered with six population counts | `packages/ai/src/answers.ts` | L7 | On KE-E2-1048's Financial Life page: question echoed as "When was this serial last counted?", then `1,061 of 1,065 units matched on the first pass` / `Counted population = 1,065` / `Matched first pass = 1,061` / `Variance rows = 4` / `Movem… |
| G45 | P2 | "git" is a bare match phrase, so a repository question answers with purchase orders | `packages/ai/src/answers.ts` | L7 | "Which git commit produced this close?" → `4 purchase orders billed before year-end with the receipt recorded after it`, naming `PO-26-1187 — Volta Components Ltd, billed 2026-12-30`, `PO-26-1241 — Cascade Systems Assembly`, `PO-26-1242 — M… |
| G47 | P2 | Locking the period makes the memo say the close has moved, with every figure identical | `packages/services/src/memo.ts` | L8 | CloseMemoScreen ClaimPanel, headline: "The close has moved since this version was issued." Detail: "The close is no longer in the state the issued version was sealed against — the position below is the close as it stands now. The issued ver… |
| G49 | P2 | suggestedBody offers management "of which 1 remain open" | `apps/web/lib/server/memo-view.ts` | L8 | In the Close Memo editor's suggested body, offered for management to adopt: "The close raised 15 exceptions, of which 1 remain open. 1 of those blocks sign-off, with $18,750 of exposure attached." |
| G09 | NOTE | reconciliation's status and management conclusion never branch on the fields that would falsify them | `packages/ai/src/answers.ts` | L2 | Status: "No — the subledger and the general ledger do not agree" — printed unchanged with the knownFact three rows below reading "Difference $0" and "Gross GL $4,800,000 / Gross subledger $4,800,000". Management conclusion: "Every dollar of… |
| G13 | NOTE | third-party's "(requested, not returned)" is a two-way branch over a three-value enum | `packages/ai/src/answers.ts` | L2 | With `confirmation: "RESPONDED"` and `supported: false`, one answer says both: KNOWN FACTS "Redwood Installation Services — confirmation" = "RESPONDED", and MISSING EVIDENCE "Year-end confirmation from Redwood Installation Services (request… |
| G16 | NOTE | blockers' "Sign-off is blocked" and its conclusion never branch on blockerCount | `packages/ai/src/answers.ts` | L2,L4 | Status: "Sign-off is blocked". Management conclusion: "The period cannot be signed off while these items are open. Each carries its own conclusion and owner." Next action: "Work the blockers in exposure order". With `blockerCount: 0` and an… |
| G23 | NOTE | formatCount's fourteen call sites never converged and nothing guards the drift | `apps/web/lib/format.ts` | L3 | The stage's own doc: "A count, grouped. Fourteen call sites write `n.toLocaleString("en-US")` inline and produce exactly this; naming it here gives them somewhere to converge … A book population printed as `1500` beside a screen printing `1… |
| G31 | NOTE | Six ExceptionResult casts declare lineage fields only get_exception can produce | `packages/ai/src/answers.ts` | L5 | Nothing wrong today: the two fields are read only inside `answerException`, which is only ever reached through `get_exception`. What the trap emits when a list-sourced element reaches the live expression at answers.ts:2203 is the product's … |
| G35 | NOTE | The lineage disclosure asserts a restriction over both reasons traceLineage returns undefined | `packages/ai/src/answers.ts` | L6 | Whenever `lineageInScope` is false the answer states: "Evidence lineage — Not available at your access scope, so the workpapers behind this exception are not among the citations below. This is a restriction on what you may read, not an abse… |
| G36 | NOTE | Refusal messages are the one rendering path that skips humanizeCanonical | `apps/web/lib/server/ask-view.ts` | L6 | The three refusal messages a reader can reach are static except NO_SUCH_OBJECT: "No object in the FY2026 close population matches EXC-007." |

### The four confirmed P0s

- **`G24` — four intents report the frozen baseline as the present close.** "Sign-off is blocked",
  7 blockers, $198,950, 81.42% readiness — answered to a Controller who has concluded them. This is
  the baseline-versus-effective split the handoff recorded as an open decision for Stage H. It is no
  longer a decision to defer: it is a P0 reaching a shipped chip on four screens.
- **`G25` — `answerException` says "No conclusion has been recorded" beside a recorded conclusion.**
  Same root cause, on the product's trust screen.
- **`G40` — "price variances" (plural) is answered by the physical-count handler.** The §3.9
  mis-route class Stage G was built to make *unrepresentable*, reborn as a plural. Found
  independently by lenses 7 and 13. `G39` and `G42` are the same defect in other words: plural
  phrasings refuse or mis-route across seven intents whose singulars answer.
- **`G46` — a RESOLVED conclusion survives the return of the record that satisfied it, and sign-off
  is then offered and recorded.** The Overview reads "Every blocker has a management conclusion.
  Signing off locks the period." beside "0 blockers · $0" and 96.8% readiness. The only confirmed
  finding in `commands.ts`, and the only one that lets a user record an act the close's own rules
  forbid.

### Where they cluster

33 of the 48 sit in `packages/ai/src/answers.ts`. That is not 33 unrelated bugs. The file is ~2,400
lines of authored sentences beside measured fields, and the recurring defect is one shape: **a
sentence that does not branch on the field that would falsify it.** `G09`, `G11`, `G14`, `G15` and
`G16` are literally that. The structural question for the fix pass is whether that shape can be made
unrepresentable rather than corrected sentence by sentence.

---

## 6. The 30 unjudged — no skeptic ever ran

Severity here is the **lens's unreviewed claim**. Verify before acting.

| id | sev | finding | file | lens | what a reader sees now |
|---|---|---|---|---|---|
| G66 | P0 | "Delivery · withheld by your access scope" is printed over a delivery that has not happened | `packages/ai/src/tools.ts` | L12 | Ask Gaurd, U-009 (AUDITOR_READ_ONLY), "Walk me through the financial life of KE-X1-9025." — KNOWN FACTS contain, verbatim: `Delivery :: FP-IN-2291 · withheld by your access scope` and `Components withheld from you :: 4`. Three rows above, i… |
| G63 | P1 | One prose value resolves the KNOWN FACTS grid to roughly seven drawer widths | `apps/web/app/icg.css` | L11 | HEAD_OF_FINANCE or CONTROLLER, "Which stock has not moved in a year?": the drawer shows eleven KNOWN FACTS labels, the last of which is "Basis" (5 characters), and its value is a 341-character sentence beginning "Months of supply divides un… |
| G72 | P1 | Present-tense verbs refuse where the table declares only the past tense | `packages/ai/src/answers.ts` | L13 | "Ask Gaurd answers from the close's own structured data. It cannot answer this from what the tools return, and it will not guess." (OUT_OF_SCOPE, route = unrouted) |
| G48 | P2 | The Overview announces "Showing this session's position" when nothing has moved | `apps/web/lib/server/data.ts` | L8 | "Showing this session's position: 0 items concluded since the run. The close as the rules derived it was 81.4% ready with 7 blockers — Reset Demo restores it." |
| G50 | P2 | "1 blocker remain" in two live workflow messages | `apps/web/lib/server/workflow-actions.ts` | L8 | In the exception panel's role="status" live region, after concluding the sixth of seven blockers: "Recorded: EXC-011 concluded. 1 blocker remain." And on the Overview sign-off control in the same state: "Sign-off is unavailable while 1 bloc… |
| G51 | P2 | statesQuantity misses the plural magnitude words, so quantitative narration passes the guard | `packages/ai/src/guardrails.ts` | L8 | Nothing today: no provider is bound and the shipped MEMO_DRAFT_SECTIONS are clean, so this is a defect in the mechanism rather than in a rendered string. The guard reports ok for "Thousands of dollars of exposure remain.", "Hundreds of unit… |
| G56 | P2 | The journal-entry drawer prints raw ROLES members | `packages/ai/src/answers.ts` | L9 | Ask Gaurd drawer on "Show me the journal entry lines.": known fact value "EXC-009 · prepared by ACCOUNTING_MANAGER · reviewed by CONTROLLER · balanced" (and the same shape for EXC-014). Rendered for all nine authorized roles. |
| G57 | P2 | price-variance spells one vocabulary three ways in one answer | `packages/ai/src/answers.ts` | L9 | One drawer answer, within ~40 characters: "PO-26-3029 — KG-K1, unfavorable $1,035  PO-26-3046 — KE-E2, unfavorable $2,862  PO-26-3078 — KE-E1, favorable ($2,857.50)  Unfavourable $3,897  Favourable ($2,857.50)  Net $1,039.50". |
| G58 | P2 | The drawer's live region announces the raw refusal enum | `apps/web/components/AskGaurd.tsx` | L9,L11 | A screen-reader user hears "Ask Gaurd declined: NOT_AUTHORIZED." (or "Ask Gaurd declined: OUT_OF_SCOPE."). A sighted reader, in the same panel, reads "Access restricted" (or "Outside what Gaurd can answer"). |
| G61 | P2 | The §0.4 regression cannot fail — the production draft guard never executes | `packages/ai/test/stage-g-regressions.test.ts` | L10 | The test's own comment: "The wiring, as a biconditional over what production actually returns: a section reaches the reader IF AND ONLY IF it passes, and a dropped section is disclosed. Verified by adding a violating section to MEMO_DRAFT_S… |
| G64 | P2 | A 46-character citation chip is nowrap in a 260px column and overflows the drawer | `apps/web/app/icg.css` | L11 | On an EXC-011-scoped drawer, asking "Which evidence is still missing?" or "What supports EXC-001?": the EVIDENCE row shows a dashed ember chip "○ Management E&O analysis and reserve conclusion" — 46 characters plus the glyph and space — set… |
| G73 | P2 | The reconciliation answer's own words, "Unreconciled" and "Unexplained", refuse when asked back | `packages/ai/src/answers.ts` | L13 | "Ask Gaurd answers from the close's own structured data. It cannot answer this from what the tools return, and it will not guess." (OUT_OF_SCOPE, route = unrouted) |
| G76 | P2 | Every CSV export prints canonical enum tokens raw | `apps/web/lib/server/export-csv.ts` | L14 | custody CSV row: "COMPANY_WAREHOUSE","The company","PRIMARY_WAREHOUSE / RECEIVING / STAGING",... — the Custody column canonical, the Held-by column beside it worded, in one row. custody BY METHOD: "RETURNED_TO_VENDOR","SCRAPPED","SALVAGE_SA… |
| G77 | P2 | physical-count CSV leaves "Adjusted qty" blank on 905 of 906 rows | `apps/web/lib/server/export-csv.ts` | L14 | "CNT-YE-2026","YEAR_END","KE-M1","PRIMARY_WAREHOUSE","PRI-12","KE-M1-3100","1","1","","0" — under the header "Snapshot qty","Counted qty","Adjusted qty","Variance", the third quantity is empty. In a spreadsheet an empty numeric cell reads a… |
| G78 | P2 | The 1,500-unit book population is a source literal in a shipped CSV cell | `apps/web/lib/server/export-csv.ts` | L14 | "Count population (units)","1065","Year-end count, counted locations only — not the 1,500-unit book population" — one `row([...])` call in which the middle cell is `summary.populationUnits` read from the service and the third cell states th… |
| G52 | NOTE | checkNarration over the engine's own prose: 24 of 66 fields fire, two on interpolated live values | `packages/ai/src/answers.ts` | L8 | reconciliation: "Every dollar of the difference is identified and attributed. Applying all 3 would bring the gross GL to the subledger, but none has been posted." financial-life: "This unit carries EXC-001." |
| G53 | NOTE | Nine intents' nextAction prescribe an act a locked period refuses | `packages/ai/src/answers.ts` | L8 | With the period LOCKED: adjustments — "Conclude the open items, then prepare and approve the remaining entries." reconciliation — "Conclude the open reconciling items, then prepare and approve the entries." pbc — "Conclude the close items t… |
| G54 | NOTE | submitEvidence is the one submitted-evidence return path that does not redact | `packages/services/src/commands.ts` | L8 | Nothing. No surface renders submitEvidence's return value — runSubmitEvidence (workflow-actions.ts:90) discards it — and the caller is the party that supplied the content, so no disclosure occurs today. |
| G55 | NOTE | work-priority's empty-first-group branch prints "then 7 more open" and a $0 blocking exposure | `packages/ai/src/answers.ts` | L8 | With zero blockers and seven open items: status "0 items blocking sign-off, then 7 more open", and exposure "Exposure held by the blocking items = 0". |
| G59 | NOTE | Five of thirty-three intents are unreachable from any chip, so the render guard never sees them | `apps/web/test/ask-chips.test.ts` | L9 | The test title reads "no answer shows a reader a canonical token" over 54 chips. |
| G60 | NOTE | The CSV and the screen spell the withheld cell two ways | `apps/web/lib/server/export-csv.ts` | L9 | CSV cell: "WITHHELD — outside this role's scope", with the file's own note "Those cells read WITHHELD, never blank." Screen cell for the same document: "Withheld", with the screen's note `that cell reads "Withheld", never blank`. The pre-ex… |
| G62 | NOTE | AiFigure.source reaches no reader, against two production comments and the plan | `packages/ai/src/types.ts` | L10 | answers.ts:1505–1508, added by the remediation commit: "`AiFigure.source` is documented as the tool the figure came FROM, and the drawer prints it as \"Answered from …\", so a plausible-looking citation is worse than none". types.ts:111: "/… |
| G65 | NOTE | The live region counts missing-evidence entries, two of which each name several items | `apps/web/components/AskGaurd.tsx` | L11 | CONTROLLER or AUDITOR_READ_ONLY, "Which stock has not moved in a year?": spoken "Answer ready. 2 required items of evidence reported missing." above two bullets, the second of which is "No observed recovery price is on file for KE-Y1, KG-K1… |
| G67 | NOTE | "population of 84 orders" — two new hard-coded plurals | `apps/web/lib/server/procurement-view.ts` | L12 | "The match figures count the close's own population of 84 orders either way." / "...still counts the close's whole population of 84 orders." |
| G68 | NOTE | The invoiced-not-received tab note names EXC-002 while its guard tests only "some open exception" | `apps/web/lib/server/procurement-view.ts` | L12 | U-001, Invoiced Not Received tab: "...that is the EXC-002 case below, and it is a blocker." U-009: "...No such order is listed above at your access scope." |
| G69 | NOTE | Five of the seven new withheld strings are unreachable at v1.2.0 | `packages/services/src/procurement.ts` | L12 | n/a — the strings cannot be reached: `answers.ts:601` "· a bill on this order is outside your access scope"; `answers.ts:634` "· the receipt on this order is outside your access scope"; `procurement-view.ts:365` "Withheld — a bill on this o… |
| G70 | NOTE | ProcurementDocumentKind is unexported and cannot express the third leg its doc claims | `packages/services/src/index.ts` | L12 | queries.ts:360, verbatim: "Which of the three legs EXIST and are outside the reader's scope." |
| G71 | NOTE | The checkDraft drop path would file the engine's self-censorship as missing required evidence | `packages/ai/src/answers.ts` | L12 | n/a today. If a section ever fails, MISSING EVIDENCE would gain "N suggested section(s) withheld: suggested wording may not state a figure or name a record...", each item carrying `AskGaurd.tsx:208`'s " — missing, required" and counted by l… |
| G74 | NOTE | phrasePattern normalizes the question but never the phrase | `packages/ai/src/matching.ts` | L13 | Nothing — that is the point. A dead phrase produces no error and no failing test; it just stops matching. |
| G75 | NOTE | The [\s-]+ word join is one-directional, and "sub-ledger" has no spaced twin | `packages/ai/src/matching.ts` | L13 | "Ask Gaurd answers from the close's own structured data. It cannot answer this from what the tools return, and it will not guess." |

---

## 7. Where the artifacts are

Durable — outside the repository and outside any temp directory:

```
C:/Users/dough/.claude/projects/C--dev-Inventory-Close/stage-g-review-artifacts/
  findings/F001.json … F096.json   the 96 raw lens findings, each with its full
                                   reproduction and the real output observed
  findings/_index.json             compact index: ref, lens, title, file, symbol, severity
  findings/_cleared.json           180 areas examined and found clean, per lens
  findings/_couldNotCheck.json     86 items a lens could not establish, per lens
  verified.json                    the 78 groups with per-skeptic verdicts and reasoning
  lens-journal.jsonl               workflow 1 raw journal (14 lens results)
  verify-journal.jsonl             workflow 2 raw journal (1 dedupe + 90 verdicts)
  _confirmed_table.md              the table in §5
  _unverified_table.md             the table in §6
```

The two workflow scripts are re-runnable as written:

```
…/665e10af-…/workflows/scripts/stage-g-adversarial-review-wf_bde8556f-ae6.js
…/665e10af-…/workflows/scripts/stage-g-verify-findings-wf_a81733f0-76a.js
```

---

## 8. How to resume

**Do not re-run the lenses.** All 14 completed and their output is in `findings/` — 2.88M tokens
already spent. Steps 1 and 2 are **done** (`1e06d58`, §0). In order from here:

1. ~~Verify `G66` by hand.~~ **Done** — it held; the fix had narrowed the defect, not removed it.
2. ~~Fix the four confirmed P0s and the three confirmed remediation P1s.~~ **Done**, plus `G39`,
   `G42` and half of `G16` closed incidentally by the compiler change.
3. **Re-verify the long tail with a refutation-seeking skeptic** before fixing it (§3a, §3c).
   Findings resting on a single lens first. Read each group's `correctionToTheClaim`, not its
   `status` — §3c is why.
4. **Judge the 30 unjudged** (§6) — two skeptics each, with the calibration corrected. `G66` is now
   off that list; 29 remain, including `G63` and `G72` at P1.
5. **Then the fix-validation fleet the plan requires**: design each fix, then one validator per fix
   asking whether it breaks a locked figure, contradicts a load-bearing decision, trips a
   registration trap, or **creates a new instance of the class it closes**. `G01`–`G03` are proof
   that last question is not theoretical — it is exactly what the last remediation did, and the
   pass in `1e06d58` should be given the same treatment before the tail is fixed on top of it.
6. Gate, browser pass, commit — per `SESSION_HANDOFF.md`.

**Three things the fix pass learned that the tail should inherit:**

- **The `answers.ts` cluster has a structural fix, and two of them landed.** §5 asked whether "a
  sentence that does not branch on the field that would falsify it" could be made unrepresentable.
  For the baseline-vs-live family (`G24`, `G25`, `G26`, `G27`, `G28`, `G29`) the answer is yes and
  it is not a rewrite: the projections already existed on the query service and the screens already
  read them — the tool layer simply did not expose them. `G26`/`G27`/`G28`/`G29` are the same two
  tools away.
- **`G40` was not a routing bug, and the tail's routing items are not either.** Ordering never got
  to arbitrate; the intent simply did not match the plural. Number agreement now compiles, so
  `G39`/`G42` closed with it. What remains in that family is a different axis: `G72` is verb tense
  and `G73` is the stem's LEFT boundary — neither is safely automatable, and both want phrases, not
  a compiler change.
- **`G42`'s "Which inventory accounts are affected?" is still unrouted** and was left that way
  deliberately: it is a missing PHRASE (`gl-accounts` declares "which account", not "inventory
  account"), not a missing inflection, and guessing at it risks a collision the census cannot see.

The 86 could-not-check items include everything that needs a rendered page: lens 11 was told not to
start a dev server because agents ran concurrently. Those want one browser pass, not a fleet, and are
listed in `findings/_couldNotCheck.json`.

---

## 9. Method notes worth keeping

- **A dedupe agent must never re-emit the findings.** Workflow 1's dedupe died on the 64,000-token
  output ceiling with all 14 lens results already banked. Dedupe returns a merge *plan* — group id,
  refs, a `primaryRef` — and the caller reassembles. Give it a reduced input view too: it does not
  need `reproduction` or `observedOutput` to judge a merge.
- **Extract each finding to its own file.** Then every downstream skeptic reads one small file
  instead of receiving 481KB inline, and a resumed run needs no giant `args` payload.
- **Assert coverage after dedupe.** Any ref the agent silently omits must be recovered into its own
  group. Workflow 2 checked and recovered 0 — but the check is what makes that a fact rather than an
  assumption.
- **A dead agent needs its own bucket.** `uncertain: 30` hid one P0 and two P1s behind a word that
  means "we looked and could not tell". They were never looked at.
- **A 100% confirmation rate is a prompt bug, not a result.** Warning a skeptic against one bias
  installs the other. State the burden once, symmetrically, and argue for neither pole.
- **Resuming is only free if every prompt is byte-identical.** Findings pushed with `raw.push()`
  inside `parallel()` land in completion order, so a later prompt built by searching `raw` can differ
  between the original run and a resume — silently re-running expensive agents. Index positionally,
  or harvest the journal and launch fresh.
