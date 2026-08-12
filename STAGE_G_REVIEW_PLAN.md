# Stage G — adversarial review plan

**Target:** commit `7333663` (Stage G: the Ask Gaurd matcher, the routing harness, eleven tools,
twenty-one intents) and `4d822b9` (its documentation). 31 files, 3,595 insertions.

**Method:** `SESSION_HANDOFF.md` §0a — finder lenses in parallel → dedupe → two skeptics per
finding carrying the SAME burden of proof and differing only in ANGLE, with a three-valued verdict
(CONFIRMED / REFUTED / **UNCERTAIN**) → a second fleet over the proposed FIXES before any editing →
apply → gate → browser → commit → **then review the remediation too**.

**Model:** Opus 5. Fable 5's documented bug-finding gains exclude security-focused analysis, which
is where several lenses below sit; it is the more classifier-sensitive of the two (a refused agent
returns `null` and its lens silently drops from the tally); it wants less prescriptive prompts than
this method writes; and it costs 2×. Consider it only for the synthesis agent.

**Provenance of this plan:** the eleven lenses below were designed by six independent vantages
(audit partner, security reviewer, test-quality, first-time Controller, attacker, maintainer) over
the diff, then merged — deliberately NOT by the stage's author, because an author naming their own
blind spots is the failure mode this repository keeps finding. The confirmed-findings section is
separate and is the author's own verification of what those vantages turned up while designing.

---

## 0. Already found and verified — do not spend a lens rediscovering these

> **✅ ALL FOUR ARE FIXED** (2026-08-12), each re-derived against the workspace before the edit and
> mutation-tested after it: every fix was reverted and the new regression watched to fail. Suite
> **1,690 → 1,749**; typecheck, lint and build clean; both roles confirmed in a browser and the
> exporter confirmed with `curl -H "Cookie: icg-role=U-009"`. The lenses should now look for what
> these did not cover — but read **§0.5 below**, which records five more defects found while fixing
> them, three of which no lens brief targets.

These surfaced while the lenses were being designed. **Each figure below was re-derived directly
against the workspace**, not taken from an agent's report. Fix them; use the lenses to find what
they did not.

### 0.1 P1 — Stage G's own scope fix was incomplete

Stage G fixed `inboundAgrees` (a comparison between a scope-filtered document side and an unscoped
book side) to `boolean | null`. **It fixed one consumer of the scope-shortened order array and left
its siblings**, all computed inside the same loop in `getProcurementPopulations`
(`packages/services/src/procurement.ts`), after the `withheldOrderCount += 1; continue;` at ~250:

| Figure | Controller | Auditor | What the auditor is told |
|---|---|---|---|
| `priceVariance.ordersCompared` | 84 | **83** | "3 of 83 compared orders" — a ratio with a silently smaller denominator, `missingEvidence: []`, no scope note |
| `summary.closeReviewRequired` | 1 | **0** | Zero orders require review under the close's own matching, while the close holds one |
| `summary.nativeIncomplete` | 6 | **5** | — |
| `summary.divergent` | 6 | **5** | The count of native-vs-close disagreements, the separation CANONICAL_SPEC §7 exists to make visible |

**And the worst of them, which is a fabricated control finding rather than a short count:**

| | Controller | Auditor |
|---|---|---|
| `invoicedNotReceived` purchase orders | PO-26-1187, PO-26-1241, PO-26-1242, PO-26-1243 | **PO-26-1201**, PO-26-1241, PO-26-1242, PO-26-1243 |

`receivedInPeriod = receiptVisible && receipt.receiptDate <= asOf`. For the auditor, PO-26-1201's
**receipt** is out of scope, so `receiptVisible` is false, so `receivedInPeriod` is false, so the
order is classified `INVOICED_NOT_RECEIVED` — **a cutoff finding manufactured from an access-scope
omission**, on a named purchase order. PO-26-1187 leaves at the same moment, so the row **count** is
4 for both roles and nothing on any surface reveals the swap. Diff row IDENTITY here, never row
count.

**Not confirmed, contrary to the fleet's report:** GRNI is *not* short for the auditor — 2 rows and
42 units for both roles, because the withheld order is not a GRNI row. The structural exposure is
real (grni is built inside the same filtered loop) but no observable defect exists today. Record it
as a latent risk, not a finding.

**Why nothing caught it:** `routing-identity.test.ts` builds one CONTROLLER context;
`ask-chips.test.ts`'s render pass is CONTROLLER-only; and its three-role pass `continue`s the
instant an answer exists, so no scoped role's answer CONTENT is asserted anywhere in the repository.

### 0.2 Figures cite a tool they were not read from

In `packages/ai/src/answers.ts`, `pbc` (~1439) declares `count: a.pbcReady, source: "get_pbc_status"`
and `count: a.pbcTotal, source: "get_pbc_status"` — but `a` is `readiness.aggregates`, which came
from `get_close_readiness`. The very next line sources `a.pbcReadinessBps` from the same object
**correctly** to `get_close_readiness`. `blockers` (~1881, ~1896) does the same with
`a.blockerCount` and `a.blockerExposureCents` against `get_blocking_conditions`.

`AiFigure.source` is documented as "the tool this figure came from — makes drift auditable", and the
drawer prints "Answered from …" from it. Both are stage-08 lines; **Stage G's new figure-source test
passes over them anyway**, because it asserts `called.has(f.source)` — membership in the set of
tools the interaction ran, not identity with the tool the value was read from. That is this
repository's own named defect shape, *a cardinality assertion standing in for an identity one*,
sitting inside the harness that carries the stage's headline claim. 28 of 34 probes call exactly one
tool, so the assertion has content on only six.

### 0.3 Four scope distinguishers are computed and never read

`packages/ai/src/tools.ts` computes `lineageInScope` (73), `withheldCount` (159), `scopeReduced`
(160) and `managementLensInScope` (176). Each exists solely to keep "withheld from you"
distinguishable from "there is none" — `tools.ts:71` says so in as many words. `answers.ts` declares
the first three in its result interfaces (168, 221, 222) and **reads none of them**; it destructures
`managementLensInScope` at 1938 and never uses it.

Stage-08 fields, but Stage G routed twenty-one new intents through the same surface, so the
consequence is wider now than when they were written.

### 0.4 Draft prose is guarded only in a test

The Stage G commit says Draft output is "checked by the same quantity and identifier guards that
govern provider narration". `statesQuantity` and `namesRecordIdentifier` are exported, but they are
called **only** from `checkNarration`, and nothing in production calls `checkNarration` on `draft`.
The only check on `MEMO_DRAFT_SECTIONS` walks a frozen module-level constant inside
`stage-g-regressions.test.ts`. The claim is true of today's constant and false of the mechanism —
the guard cannot generalise to a second draft-emitting path.

### 0.5 Found while fixing §0 — also fixed, and mostly outside the lens briefs

**(a) "Withheld by your access scope" printed to a CONTROLLER, on 40 of the 1,500 serials.**
`get_evidence_timeline`'s withheld branch tested only whether the UNSCOPED side named a record, never
whether the reader's own side also did. An inbound unit with a visible carrier shipment and no
delivery yet has a readable `ref` and `present: false`, so it fell through and every reader was told
`FP-IN-2288 · withheld by your access scope` about a delivery that had not happened — the recurring
trap running backwards, a restriction claimed over a world fact. The handler's own second rule
already said a carrier shipment is not a delivery. Now withheld requires the scoped ref to be absent,
and the CONTROLLER's count is 0 where the auditor's is 4. **No lens brief covers this**; lens 6 owns
`scopeReduced` but only as an unread flag.

**(b) The flagship card contradicted its own narrative.** Over PO-26-1201 the auditor's Three-Way
Match card read `ITEM RECEIPT · No record · No item receipt references this order` three lines above
that card's own exception text naming `IR-26-2214` and its 2026-12-30 receipt date. Second root
cause, second service: `getProcurementDetail` (`queries.ts`) drops a withheld document with no
distinguisher, exactly as `getProcurementPopulations` did. **Found by opening the page as the
auditor** — nothing in §0.1's measurements reached it.

**(c) The invoiced-not-received tab told every auditor to look for "the EXC-002 case below"** while
EXC-002 rides on the one order their scope withholds, so all three visible rows read "No close
exception". A hard-coded note, so no assertion about the rows could reach it. Lens 2's shape, found
in the browser.

**(d) A live hard-coded plural in the procurement export**: `"1 orders are outside this role's
scope"`, the auditor being the role that withholds exactly one. Same shape as Stage F's "1 comments",
in a file no lens opens.

**(e) The claim-content guardrails cannot be extended to the engine's own prose, and trying is the
finding.** The first `checkDraft` applied `FORBIDDEN_ACTION_CLAIMS` as well as the structural rules
and instantly rejected the shipped "Reconciling items" section over `has been posted` — inside
*"Nothing in this product has been posted, so the memo should not describe the ledger as
corrected."* Those patterns catch a PROVIDER claiming the product acted; draft prose says those verbs
to tell a writer what the product does not do. Separating the two means deciding whether a claim is
negated, which is the same undecidable comparison as deciding whether a figure is the right figure.
`checkDraft` therefore applies the two structural rules only, and a test records why.
**Lens 8's brief plans to run `checkNarration` over every `managementConclusion` and `nextAction`;
expect the same false positives, and treat a hit as a question about the guard, not the sentence.**

Two method notes for the lenses:

- **Diff row IDENTITY, never row count** — §0.1's worst finding swapped one purchase order for
  another and left the count at 4. The repo's own test had asserted `auditor.orders.length +
  withheldOrderCount === controller.orders.length`, which was true throughout.
- **The membership-vs-identity figure test (§0.2) now perturbs each tool's result and asserts the
  precise defect signature**: a figure citing tool S that does not move with S but does move with
  another tool the same answer called. Two weaker forms were tried first and both reported
  correctly-sourced figures — `count: matches.filter(…).length` moves with no perturbation of the
  numbers inside those matches. Lens 5 should start from the test, not from the 126 literals.

---

## 1. The lenses, in run order

Each brief is written to be executable by a fresh agent with no other context. `howItCouldWasteTime`
is not optional garnish — it is the false-positive class to pre-empt in the agent's prompt.

### Lens 1 — role-scoped replay: every rendered string, every demo role

**Targets.** `packages/ai/src/answers.ts` (grni ~516, price-variance ~642, invoiced-not-received
~564, disposition ~862, consignment ~933, custody, cost-stack, counts, eo-aging, memo-draft 241,
procurement-chain ~1303); `packages/services/src/procurement.ts` 201–440 (the `continue` at 250–254,
`receiptVisible`/`billVisible` 256–260, the summary block ~390–403);
`packages/services/src/ownership.ts`; `packages/services/src/memo.ts` 191–233;
`apps/web/lib/server/ask-view.ts` 180–258; `apps/web/lib/server/procurement-view.ts`;
`apps/web/components/ProcurementScreen.tsx`.

**Brief.** Replay every shipped chip and every probe as every demo user and diff what the reader is
told. Build the chip population exactly the way `apps/web/test/ask-chips.test.ts` does (readdir over
`apps/web/components`, the `askSuggestions` regex, quoted and backtick literals, `${…}` →
`KE-E2-1048`, `askScope` → `EXC-001` / `KE-E2-1048`), add the 34-entry `PROBES` literal from
`routing-identity.test.ts`, and call `askGaurdData(userByRole(role), question, scope, 'c')` for all
ten `DEMO_USERS` against **one** workspace built once. Record status, managementConclusion,
nextAction, every knownFacts label and value, conflictingEvidence, missingEvidence, exposure. A field
that differs from the CONTROLLER rendering is defective **unless that same answer states the
difference is access scope** — a withheld figure, a withheld line, or an explicit null-comparison
sentence. §0.1 above gives four verified anchors; verify and expand from them rather than
re-deriving. Then extend: disposition and consignment count `rows` in the status sentence while the
withheld count sits only in a knownFact row; memo-draft's withheld path is zero today, so force it
with `saveMemoDraft` as a Controller and re-ask as the auditor. For each web surface, state WHERE
the withheld note renders relative to the figure it qualifies — a note on the match tab does not
qualify a PPV tile on another tab.

**Do not report.** SYSTEM_ADMIN's NOT_AUTHORIZED refusals. Shortened row LISTS as such — withholding
rows is what scope is for; the defect exists only where a shortened population is presented as a
completed measurement. `inboundAgrees` (fixed and pinned). invoiced-not-received's own withheld
figure and three-way conclusion. `memo.withheldNote`. financial-life's per-event withheld labels.
`removedFromBook`, `outsideSubledger`, `coversBook`, `disposedSerialsOnBook`,
`consignedSerialsOnBook` — computed over the full dataset collection, they do not narrow with scope.

### Lens 2 — authored sentence against the measurement sitting beside it

**Targets.** `answers.ts` header claim 54–61; reconciliation 1378–1409 against `ReconResult` 171–177
(`potentialAdjustedGlCents`, declared and never read); blockers 1862–1905; memo-draft 262–299 against
`memo.ts` 84–104 (`positionMoved`, never read by the answer); third-party ~1030; grni ~557;
price-variance ~670; procurement-chain ~1351; counts ~1955; pbc ~1455; eo-aging ~1159; cost-stack
692–735; cost-classification 751–785; consignment 933–982; custody 1063–1099; disposition 862–915;
plus the 17 hard-coded `assertions:` lists (505, 556, 630, 669, 727, 777, 833, 907, 974, 1024, 1091,
1158, 1203, 1350, 1397, 1954) against the rule-derived ones (1566, 1723, 1746, 2107) and
`packages/rules/src/readiness.ts:172`.

**Brief.** For every authored status or managementConclusion, find the field ON THE SAME tool result
that would falsify it, then check whether the sentence branches on that field or is emitted
unconditionally. Mutation-test each candidate: flip the falsifying field, re-run, confirm the
sentence moves. Two to verify and report rather than re-derive: `reconciliation` hard-codes
"No — the subledger and the general ledger do not agree" with `recon.differenceCents` three lines
below, and asserts "Every dollar of the difference is identified and attributed. Applying all 3 would
bring the gross GL to the subledger" while `potentialAdjustedGlCents` and `subledgerCents` sit in the
same object and are never compared — and the neighbouring `gl-accounts` intent DERIVES the identical
claim from `unexplained.length`, so one claim is derived in one intent and authored in the next.
`blockers` hard-codes "Sign-off is blocked" beside a measured `blockerCount`. Also: memo-draft's
issued branch never reads `positionMoved`, the field that exists solely to say whether the sealed
position still holds. Then the same shape one level down — `assertions` is a claim about which
financial-statement assertions a population puts at risk, authored inline by 17 intents while the
exception-derived paths read the rule's own `finding.assertions`; for every intent whose citations
name exceptions, compare and report any assertion the assistant asserts that the rule does not. Same
for `conflictingEvidence` (it must be two records that cannot both be right — check `unit-conflicts`
1687–1753, which maps every open exception's `whyFlagged` into it under a heading saying those items
"carry evidence that conflicts", while several are waiting on a record that does not exist) and every
`exposure` slot (the label must name exactly what was summed, nothing double-counted).

**Do not report.** A sentence for being authored — `guardrails.ts` 275–291 explains why conclusions
are authored on purpose. The finding requires naming the falsifying field on the SAME result and
showing the sentence does not move with it. Claims about the PRODUCT that a typed field makes
structurally true. Generic accounting policy statements. The DATA's own recorded status. Empty
assertion arrays. Verify the branch does not exist before writing anything up — cost-stack,
cost-classification, cogs-relief, disposition, consignment, custody, gl-accounts,
invoiced-not-received and memo-draft all branch on a measured boolean.

### Lens 3 — the stage's own authored justifications, audited against the code they defend

**Targets.** `procurement.ts` 249–254 (the visibility comment above the `continue`);
`costing.ts` ~49–53, `methodology.ts` ~52–56, `glAccounts.ts`, `eoMethodology.ts`, `memo.ts` — each
module's authored justification for skipping `makeRecordScope` — against `queries.ts` 176–188 and its
live call sites; `memo.ts` 197–203 (`isAuditor` withholding) against `packages/permissions`;
`answers.ts` `routeQuestion` 2170–2181 against `answerQuestion` 2210; `apps/web/lib/format.ts`
`formatCount` 53–62; `ask-view.ts` 119–127; the commit's Draft claim against `guardrails.ts` and
`MEMO_DRAFT_SECTIONS`.

**Brief.** Your job is to find where the author of Stage G was WRONG about their own work. Every
target is a sentence the stage wrote asserting a property of its code. Seven to start, all
reproducible: (1) `procurement.ts:249` says "The match status is a close-control fact and stays
visible; the source documents behind it obey the same scoping" — the next four lines drop the whole
order via `continue`, so the match status does NOT stay visible. (2) Five service modules skip
`makeRecordScope` on a prose justification of the form "nothing here reads a source document"; for
each, check whether any returned collection carries a `sourceRef` or derives from one — Stage G
routed ten of these projections into a drawer every role has on every screen. (3) `memo.ts` 197–203
withholds the unissued draft from `isAuditor` only, keyed on the literal role name, while
authorization elsewhere is keyed on permissions — determine whether LEGAL, WAREHOUSE, SUPPLY_CHAIN
and FPA receive `workingDraft.body` verbatim through `get_memo`, and whether anything renders it.
(4) `routeQuestion`'s doc says `answerQuestion` uses it "so the two cannot disagree" — `answerQuestion`
re-runs `INTENTS.find` itself at 2210; the guarantee is a duplicated expression that happens to be
identical. (5) `formatCount` was added with a comment about giving fourteen inline call sites
"somewhere to converge" — count how many actually converged. (6) `ask-view.ts` 119–127 claims the
chip test "keeps this map complete rather than merely current"; that test's TOKEN requires an
underscore while the map's regex matches single words (see lens 9). (7) The Draft claim — see §0.4;
establish the consequence by running the memo question as each of the ten demo users against
`getMemo(...).canDraft`.

**Do not report.** The permission matrix (documented design). The absence of screen-level nav gating
(the gate lives in services by design). A projection that genuinely reads no `sourceRef`-carrying
collection — verify the returned fields before flagging. "Move `count` into `format.ts`" — the
package direction is one-way; the finding is that nothing asserts the two produce the same string.

### Lens 4 — two closes in one drawer: baseline state versus effective state

**Targets.** `tools.ts` 61–210 (all 27 handlers); `queries.ts` 610–646 and ~1160–1210;
`effective.ts`; `memo.ts` 190–235; `answers.ts` memo-draft 240–299, readiness-explained 300–347, pbc
1413–1461, work-priority 1756–1821, largest-exposures, blockers, missing-evidence, resolved-exceptions,
serials-with-exceptions, unit-conflicts, `answerException` 2065–2131.

**Brief.** Classify each of the 27 tools as reading the RUN BASELINE (`ws.close`) or the EFFECTIVE
close, and produce that table as part of the finding. Stage G added `get_memo` and `get_methodology`,
which read effective state, alongside stage-08 tools that read baseline — so two answers in one
drawer can describe two different closes. Reproduce: `submitEvidence` plus `reviewEvidence` against
each unmet requirement of EXC-001, then `concludeException`; **rebuild** the query and projection
services afterwards, since both close over derived state; then ask "What prevents sign-off?",
"Draft the close memo for me.", "Why is this still open?" `{exceptionId:'EXC-001'}`, "Which evidence
is still missing?", "Which exceptions are resolved?". Reported by the accounting vantage and to be
verified: after concluding EXC-001, `getExceptionWorkflow` reports RESOLVED_NO_ADJUSTMENT with zero
unmet requirements while the drawer answers "WAITING_ON_CONTRACT" and "Open. No conclusion has been
recorded"; in the same session the memo intent reports 6 open / 6 blockers / 83.58% while the
blockers intent reports 7 / 81.42% and says "Sign-off is blocked". `readiness-explained` prints its
own `readinessDiverged` sentence in that state, proving the codebase knows the split exists and the
newly-routed intents do not. Write each finding as the accounting claim it is — the product telling a
Controller no conclusion has been recorded on an item they just concluded — not as a plumbing note.

**Do not report.** Every baseline-reading tool. Require two things per finding: a contradicting pair
produced on ONE run, and a sentence or intent Stage G authored or newly routed into. "The assistant
should describe the run baseline" is a defensible design choice — the defect is the contradiction.

### Lens 5 — figure provenance: the tool a figure names versus the tool it came from

**Targets.** All 126 `source: "get_…"` literals against the 43 `s.run<T>("…")` call sites,
concentrating on the six multi-tool intents (pbc 1428–1450, blockers 1873–1898, procurement-chain,
work-priority, unit-conflicts, financial-life); the nine structural interfaces at `answers.ts`
130–224; `tools.ts` `run<T = unknown>`; `types.ts:111`; `routing-identity.test.ts` 233–252;
`ask-view.ts` 200–202.

**Brief.** Two linked checks. **(A) Provenance:** for every `AiFigure` literal, trace the value
expression back to the `s.run` that produced the variable it reads, and compare that tool to the
declared `source`. §0.2 gives two confirmed instances; verify them, then sweep the remaining 31
intents. Measure the cost by re-deriving each suspect figure from ONLY the tool it names, and
mutation-test by making the sources disagree. State the assertion that would have caught it — the
handler must be unable to name a tool it did not read the value from — and whether it is expressible
without rewriting the handlers. **(B) Casts:** `run<T>` takes its type argument from the caller and
its tool name from a separate argument, so nothing connects them. For each `s.run<T>('name')`, check
`T` against what `HANDLERS['name']` returns; report any `T` naming fields the handler cannot produce,
and any field a sentence interpolates that the handler does not return (it renders `undefined`/`NaN`
with no test failing). For each of the nine structural interfaces, name the `@icg/services` type it
restates and report any field already drifted.

**Do not report.** The 28 single-tool intents — with one tool called the citation cannot name
anything else. A figure whose value passes through a local alias unless the ORIGINATING `s.run` names
a different tool. `readiness.aggregates.pbcReadinessBps` sourced to `get_close_readiness` is CORRECT.
The structural interfaces for existing — `answers.ts` 119–128 says why they stay.

### Lens 6 — withheld rendered as absence, and restriction rendered as inability

**Targets.** `tools.ts` (get_exception 67–74, get_evidence_timeline 92–163, get_cycle_count_history
166–178, `runTool` 213–235, `createToolSession` 242–261 where `run` returns `undefined` for BOTH
NOT_FOUND and NOT_AUTHORIZED); `answers.ts` (the four declared-but-unread flags, the `return
undefined` sites at judgements 366, third-party 998, valuation 1186, resolved-exceptions 1619,
missing-evidence 1549/1583, unit-conflicts 1699/1705/1734, and the OUT_OF_SCOPE refusal 2260–2318);
`queries.ts` `traceLineage`, `getCountDetail`, `getPbcPackage`; `ask-view.ts` 244–257.

**Brief.** Three attacks. **(1) Unread distinguishers** — §0.3. Prove the consequence per field by
running the same question as CONTROLLER, AUDITOR_READ_ONLY and WAREHOUSE on one workspace and
diffing status / knownFacts / conflictingEvidence / missingEvidence / citations. Anchor to verify:
`traceLineage` returns `undefined` for an auditor on any exception without provided support, so on
EXC-004 a Controller gets 4 citations including MGT-19 and an auditor gets 3 — same status, same
missingEvidence, nothing saying anything was withheld, on the product's trust screen. **(2) Empty
population rendered as inability** — several handlers return `undefined` precisely when the news is
good (third-party when every holding is supported, valuation when no review is open,
resolved-exceptions, judgements, missing-evidence's scoped branch), and `answerQuestion` then falls
through to OUT_OF_SCOPE: "It cannot answer this from what the tools return, and it will not guess."
For each, determine whether any role's scoping or any in-session command can empty that population,
and report the question whose true answer is "there are none" but which renders as an inability.
**(3) Partial tool sets** — `run` returns `undefined` for NOT_FOUND and NOT_AUTHORIZED alike, so no
handler can tell a denial from an emptiness; the distinction rests entirely on `session.anyDenied`
being consulted before every refusal AND on no handler answering from a surviving subset. For every
multi-tool intent, work out what happens when the first tool succeeds and a later one is denied.
Finally, confirm no refusal string can carry a canonical token or an identifier the reader may not
see — the refusal branch is the only rendering path that skips `humanizeCanonical`.

**Do not report.** The withheld FIGURES that already exist. `life.missing` (computed from unscoped
lookups, so "no record exists" is a genuine world fact). NO_SUCH_OBJECT on an exception id or serial
(neither collection is record-scoped). The NO_SUCH_OBJECT probe's `anyDenied` recheck — fixed in an
earlier stage. An unused destructured field on its own — it is a finding only where a reader is
misled by what replaced it.

### Lens 7 — which object, and which question, actually got answered

**Targets.** `answerQuestion` 2196–2245 (scope resolution 2201–2202, the `asksWhyOpen` branch, both
fallbacks 2227–2245); the INTENTS table; `matching.ts`; `ask-chips.test.ts` 159–166;
`apps/web/components/*.tsx`; `routing-identity.test.ts` PROBES 87–147.

**Brief.** Three directions. **(A) Scope substitution:** `scopedException = context.exceptionId ??
extractExceptionId(question)` — the SCREEN's scope outranks the id IN the question. From EXC-001's
drawer, "Why is EXC-007 still open?" returns EXC-001's detail with citations to `/exceptions/EXC-001`
and no sentence saying the named object was ignored. Also: extraction runs on the RAW question while
matching runs on the normalized one, so an en-dashed serial pasted from a memo refuses OUT_OF_SCOPE
about a unit the product is rendering. **(B) Chip route identity:** `ask-chips.test.ts`:159–166 is
titled "routes to a named handler" and its comment says an answer from the scoped-object fallback
where the chip named a topic is a routing miss — then asserts membership in a 35-element set
containing every non-refusing route including that fallback. Build the assertion the comment
describes. Two anchors to adjudicate: `FinancialLifeScreen` ships "When was this serial last
counted?" on the one screen whose `askScope` is a serial; it routes to `counts` and its output is
JSON-identical with and without the serial in scope — a reader asking about one unit is answered
about 1,065. `ExceptionDetailScreen` ships "What does NetSuite say?" and "Which assertions are
affected?", for which `routeQuestion` returns `undefined` and both are absorbed by the fallback.
Generalise: for every chip on a scoped screen, diff the answer with and without the screen's scope
and report any chip whose output is scope-invariant while its wording says "this". **(C)
Responsiveness:** for each of the 54 chips, judge whether a yes/no question gets a polarity word,
whether a which/what question gets the named objects rather than only a count, and whether the answer
is about the noun the question names. Confirmed misses to verify: "Are all third-party confirmations
in?" routes to `custody` and answers "1,500 book units across 9 custody types" — `phrasePattern`
does no stemming, third-party's group lists the singular "confirmation", and custody sits later with
a bare `any` phrase "third party". "Which entries have been prepared?" refuses OUT_OF_SCOPE although
`journal-entry` and `adjustments` both exist. "Which git commit produced this close?" routes to
invoiced-not-received on the bare phrase "git". Then sweep the phrase table for the same morphology
gap, and for every bare high-frequency `any` phrase (memo, count, variance, chain, excess, feed, je,
posted, priority) and function-word `all` group.

**Do not report.** A mis-route unless you can state a reader-plausible question AND show the winning
handler names a wrong object or population — "accounting impact of the scrapped units" → cogs-relief
and "chain of custody" → custody are deliberate. A chip merely for reaching a topic handler. A screen
and handler being differently named. Scope-invariance without BOTH the chip text referring to the
object on screen AND a diff proving it. Tone, terseness, or the deliberate refusal to conclude.

### Lens 8 — break it: drive the product into the states no test reaches

**Targets.** `commands.ts` (submitEvidence, reviewEvidence, concludeException, saveMemoDraft,
issueMemoVersion, lockPeriod); `answers.ts` memo-draft 269–273, readiness-explained ~340, blockers,
reconciliation, pbc, unit-conflicts, resolved-exceptions; `guardrails.ts`;
`apps/web/lib/server/workspace.ts` (`makeContext` stamps `WEB_UI` while every test stamps
`ASK_GAURD`); `stage-g-regressions.test.ts` 288–320.

**Brief.** Report ONLY attacks you ran and observed succeeding; paste the reproduction; drop anything
you merely reasoned about. Every Stage G test builds a fresh workspace, so every branch behind a
command is unexecuted. (1) Drive the demo's legitimate path — submitEvidence plus reviewEvidence,
then `concludeException` on all seven blockers — and re-ask every chip and probe. (2) `saveMemoDraft`
→ `issueMemoVersion` → re-ask as Controller and as auditor; this reaches memo-draft's issued and
workingDraft branches and `memo.ts`'s role-keyed nulling, which together can make an auditor read
"Nothing drafted and nothing issued" about a close where a draft exists. (3) `lockPeriod`, then
re-ask everything. (4) **Turn the product's guardrail on its own prose:** call `checkNarration` on
every intent's `managementConclusion`, on every `nextAction`, and on every `MEMO_DRAFT_SECTIONS`
body, and read what fires. The engine applies its quantity and identifier checks to provider
narration but never runs FORBIDDEN_ACTION or the FINALITY-vs-status check over the sentences it
writes itself. (5) Feed the guards inputs they must catch — a spelled-out number, a percentage, a
serial, an exception id — to confirm they are load-bearing rather than satisfied by prose that was
never going to contain a figure. (6) Construct the second ordering group `firstUnblocked` needs and
check whether work-priority's ordering claim holds when it exists.

**Do not report.** Anything you did not run. A constant merely for being a constant. The DATA's own
recorded status. Findings that duplicate lens 4. The AI-unavailable state or the SYSTEM_ADMIN path.

### Lens 9 — canonical tokens reaching a reader

**Targets.** `ask-view.ts` (`humanizeCanonical` 128–148 and its `/\b[A-Z][A-Z0-9_]+\b/g`;
`CANONICAL_LABELS` 85–117, sixteen spreads where later ones win; the hand-listed `EXCEPTION_STATUSES`
57–65 and the literal PBC list; the four fields never humanized — assertions 228, draft 237,
narration, and the whole refusal branch 244–257); `ask-chips.test.ts` 181–199;
`packages/domain/src/enums.ts`; `methodology.ts` `INTERPRETATION_HOME` / `INTERPRETATION_CONSTANT_NAMES`;
`queries.ts:331`; `workflow-view.ts` 160–175; `AskGaurd.tsx` aria-live ~96–105.

**Brief.** Four attacks. **(1) Regex asymmetry:** the chip guard's TOKEN requires an underscore while
`humanizeCanonical` matches single words and its own comment says single-word vocabularies need
wording too — so every single-word canonical value is structurally invisible to the test that is
supposed to keep the map complete. Re-run the sweep with the detector widened and triage. **(2)
Precedence:** `humanizeCanonical` checks `INTERPRETATION_CONSTANT_NAMES` BEFORE `CANONICAL_LABELS`
and returns the token verbatim on a hit; `CUSTODY_HOLDER` is both an `INTERPRETATION_HOME` value and
a `DIMENSION_LABELS` key, so judgements renders `CUSTODY_HOLDER — Company warehouse` while
methodology-view renders it as words — and the chip test filters that exact token through the same
allowlist, so the guard is blind to it by construction. Enumerate every other allowlisted token that
is also a key in any spread source. **(3) Collisions and hand-lists:** enumerate duplicate keys in the
flat Map and, for each, determine whether a value from the LOSING vocabulary can appear in an answer.
Then check the two hand-listed vocabularies against `@icg/domain`'s exports — in the same literal the
file MAPS OVER `ACCOUNTING_CLASSIFICATIONS`, `SOURCE_SYSTEM_IDS` and `ASSERTIONS` while hand-listing
statuses. A hand-listed allowlist is the same failure as an enumerated denylist. **(4) Unhumanized
doors:** assertions, draft, narration and the refusal branch never pass through the map; the
aria-live region announces `Ask Gaurd declined: NOT_AUTHORIZED` while the visible title reads "Access
restricted". Decisive anchor to check first: third-party renders the confirmation status as a bare
`REQUESTED` value, and the enum is `NOT_REQUESTED | REQUESTED | RESPONDED` — the test can see one of
three members and is blind to the other two, so it passes because today's fixture landed on an
invisible one.

**Do not report.** Identifier prefixes (EXC, PBC, PO, SO, MSA…). Acronyms a reader wants verbatim
(GL, GIT, RMA, SKU, NRV, ERP, WMS, CRM, FY2026). Vendor names in caps. The
`INTERPRETATION_CONSTANT_NAMES` the design prints on purpose. Report a token only if it is a member
of a declared enum type — confirm by finding the declaration — AND the screen that owns that
vocabulary renders it as words. HEALTHY / STALE / PARTIAL are printed as tokens on the screens too,
so those are a guard-coverage note, not a two-spellings inconsistency.

### Lens 10 — the harness that cannot fail

**Targets.** `ask-chips.test.ts` (the three-role loop 229–264, whose only assertion sits under
`if (r.answer !== undefined) continue;`; the CONTROLLER-only render pass 201–225);
`stage-g-regressions.test.ts` (the `auditor` context used in exactly one test; the biconditionals
149–211, which hard-code CONTROLLER on both sides; the `firstUnblocked` guard 288–320);
`routing-identity.test.ts` (the CONTROLLER-only context; PROBES; the ungrouped-count sentence list
254–289; the tool loop 336–369).

**Brief.** Find the assertions that never execute and the guards whose coverage is narrower than
their titles. **Instrument each test body with a counter and print how many times each `expect` is
actually reached — do not reason from the source.** Four measured starting points: (1) the three-role
loop's measured refusal counts are AUDITOR 0/54, PREPARER 0/54, WAREHOUSE 3/54, so 3 of 162
iterations reach an assertion — and the untested direction is the live one, WAREHOUSE answering 51 of
54 close-accounting chips with nothing asserting it should. (2) `firstUnblocked`'s own comment
concedes its branch does not exist on this data. (3) the ungrouped-count guard covers status,
conclusions, nextAction, conflicting and missing evidence, and knownFacts LABEL — but not knownFacts
`text` (163 values across the probe table), not `exposure.label`, and not `draft`, while `answers.ts`
composes counts into `text` in grni, procurement-chain and financial-life. (4) neither tool loop has
a floor on `AI_TOOL_NAMES.length`, unlike the phrase population which has two. Then extend by the
same method and list what a fresh workspace structurally cannot reach: `memo.issued`,
`memo.workingDraft`, `readinessDiverged`, PBC REFRESH_REQUIRED, in-session resolutions.

**Do not report.** Rank strictly by whether a wrong OUTPUT is reachable through the gap. A guard
covering five of eight fields with no defect in the other three is a coverage note, not a bug. Do not
rewrite the biconditionals — they are the strongest tests in the stage; note only which intents they
do not cover (blockers and reconciliation both carry hard-coded statuses and neither has one).
Cross-reference the membership-not-identity figure test to lens 5.

### Lens 11 — the drawer as a reading surface

**Targets.** `apps/web/app/icg.css` (`.icg-drawer--ask` ~1430, `.icg-ask-fact` / dt / dd ~1965–1991);
`AskGaurd.tsx` (the knownFacts `dl`, the evidence maps, the aria-live region, the refusal block);
`answers.ts` every `text:` figure.

**Brief.** The only lens that reads the CSS and the component rather than the engine. (1) **Layout:**
`.icg-ask-fact` is a flex row where `dt` has `min-width:0` and `overflow-wrap:anywhere` while `dd` has
`flex-shrink:0` and `text-align:right` and neither — justified in the CSS comment for a currency
value. Several intents put full prose in the value slot: "What did we dispose of this year?" as
Controller produces a `dd` of roughly 180 characters. Determine what that does to the label beside it
and to horizontal scroll, and check every text-branch intent — Stage G added eleven tools whose
results render through it. (2) **Duplicate React keys:** conflictingEvidence, missingEvidence and
assertions are keyed by the string itself; find a question and role where two identical strings occur
and confirm what renders and whether React warns. (3) **Announced versus visible:** the aria-live
region announces `${missingEvidence.length} required item(s)` but the array holds SENTENCES, several
naming multiple outstanding items — find a question where the announced number and the visible list
disagree. Note the `(s)` against the repo's hard-coded-plural rule, and the same shape in
procurement-chain's "is missing 1 required component(s)." on seven of eleven rows. (4) The refusal
path renders a raw `refusal.reason` into the aria-live region.

**Do not report.** Font sizes, spacing, colour, or design choices the CSS comments defend. The
AI-unavailable state. `plural()` where it is used correctly — state a count's possible values before
calling a hard-coded plural a defect.

---

## 2. Coverage gaps in this plan

Named honestly, because a plan that does not say what it skipped reads as complete:

- `apps/web/lib/server/export-csv.ts` (8 changed lines) — no lens opens the CSV output. A
  scope-shortened procurement figure reaching an exported file, where neither `humanizeCanonical` nor
  the drawer's wording applies, is unexamined. **Given §0.1, this is the highest-value gap.**
- `InventorySearchScreen.tsx` and `view-model.ts` — read only as sources of chip text and scope.
- `apps/web/lib/server/workspace.ts` — touched only as a note. Nothing reviews the projection-service
  construction, even though lens 4's reproduction depends on those services closing over derived state.
- `packages/services/src/projections.ts` as a module — its per-projection `authorize` calls are
  covered by lens 3, but not its own construction or whether every projection takes the caller's context.
- `matching.ts`'s compiler — attacked only for morphology and collisions. No lens audits
  `phrasePattern`'s boundary construction, the trailing-`*` escape hatch, or `normalizeQuestion` for
  **false negatives** (a legitimate phrasing the compiler now fails to match), which is the risk the
  stage created by rewriting every pattern.
- `humanize.ts`, `costing-view.ts`, `custody-view.ts`, `methodology-view.ts` — read only as label
  sources; their changed lines are not reviewed as code.
- `types.ts`, `index.ts`, `guardrails.ts` diffs — read only where a lens needed one symbol.
- No lens runs the suite, typecheck, lint or build. Every claim here about test behaviour is a claim
  about reachability, not about whether the suite is green (it is: 1,690 / 72 at `7333663`).
- Only lens 11 opens a browser, and only optionally.

---

## 3. Run notes

**Setup.** Dynamic imports from a package directory that resolves them:

```bash
cd "C:/dev/Inventory Close/packages/ai" && node "C:/dev/Inventory Close/node_modules/.pnpm/tsx@4.23.11/node_modules/tsx/dist/cli.mjs" -e "(async()=>{ /* … */ })()"
```

`cd apps/web` for anything importing `./lib/server/ask-view.ts`. Print to stdout only; the review is
read-only and must create no files. **Ban writes explicitly in every agent prompt** — no file
creation, no `>` / `>>` / `tee`, no state-changing git. Check `git status --porcelain` after the run.

**Ordering.** Lens 1 produces the role × question × field matrix that lenses 4, 6 and 9 consume — run
it first and keep its output. Build ONE workspace and reuse it across roles inside a run; mutating
between roles manufactures false diffs. Lenses 4 and 8 mutate the workspace via `createCommandService`
and MUST run in their own processes, after lens 1, rebuilding the query and projection services after
every command. Run 5 before 8 so the provenance table exists before 8 starts moving numbers.

**Cross-references, so one defect is not reported three times.** Procurement population divergence →
lens 1. `inboundAgrees` → nobody, it is fixed and pinned. The membership-not-identity figure assertion
→ lens 5; lens 10 cites it. The refusal branch skipping `humanizeCanonical` → lens 9. Command-driven
contradiction pairs → lens 4; lens 8 reports only what 4 did not produce.

**Cost.** Lenses 1, 4, 5, 7 and 8 are execution-heavy (lens 1 alone is ~880 answers across ten roles)
and are where the yield is. Lenses 2, 3 and 10 are read-and-verify. If the session must be cut short,
1–5 carry the confirmed findings; 9, 10 and 11 are the ones to drop.

**Evidence bar.** Every finding names the file and symbol, quotes the two strings a reader would
actually see, and says which house rule it breaks: scope reported as absence or as a finding; a
comparison that did not happen reported as a negative; the product concluding; narration or draft
prose carrying a figure or an identifier; an enumerated denylist standing in for a category; a raw
canonical enum on one surface worded on another; a hard-coded plural. Anything that cannot be stated
as one of those, or as a straightforward wrong number, is a note — label it as such.
