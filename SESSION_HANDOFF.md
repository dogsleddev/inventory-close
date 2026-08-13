# Inventory Close Gaurd — Session Handoff

**Purpose:** everything a fresh Claude Code session needs to continue this build without
re-deriving decisions or breaking locked facts. Last refreshed 2026-08-12, after Stage G's
review, its re-verification, nine fix commits and a fix-validation fleet over those commits.

> The product name is deliberately spelled **Gaurd**, never "Guard". Do not "fix" it.

---

## 0a. START HERE — every P0 and P1 is closed, and the fix pass has been validated

> ### ⬅ READ `STAGE_G_REVIEW_STATUS.md` FIRST. Its §0z is the newest part.
>
> **HEAD is `a4b4e6f`.** The Stage G review, its re-verification, nine fix commits, a fix-validation
> fleet, and the fleet's entire 48-item tail are all done and committed. **Nothing the review or the
> fleet confirmed at P0 or P1 remains open.** Gate: typecheck, lint and production build clean, 20
> routes, **2,488 tests across 73 files passing**. Locked baseline unmoved and re-confirmed in a
> browser as the Controller and as U-009, in the diverged state.
>
> **What remains is the review's OWN ~44-item tail** from `G01…G96`, listed by file in
> `STAGE_G_REVIEW_STATUS.md` §0d/§5/§6 — a different list from the fix-validation one, which is
> closed. **Five of them are open P1s: `G11`, `G14`, `G15`, `G19`, `G63`.** Both this document and
> §0d previously said no P1 remained; that was a hand-written count taken before §3b raised nine
> findings to P1. See the correction in §0z. Then Stage H (QA).
>
> **And three things no plan in this repo covers, found by an independent assessment on 2026-08-12
> and each verified by execution — read these before planning anything:**
>
> 1. **The record-a-conclusion loop contradicts itself on the exception detail page.** Conclude
>    EXC-003 `RESOLVED_NO_ADJUSTMENT` with its evidence obtained, and the Overview correctly reads
>    "6 blockers · $189,750" while `/exceptions/EXC-003` renders header status "Recount Required",
>    conclusion "Open", `blocker: true`, "Exception 3 of 7 blockers" and "Obtain: Supervised recount
>    locating the unit" — above a panel reading "Resolved — no adjustment required" with
>    `unmetRequirements: []`. `getEffectiveClose` is called ONCE in `data.ts` (line 356, the
>    Overview); `getBlockers` is called at 84, 179, 347, 708, 721 and 903. `b1cf8aa` closed this
>    family on the surfaces it touched and left the rest.
> 2. **An auditor is told evidence does not exist where it exists and is withheld.**
>    `traceLineage` returns nothing for U-009 on EXC-002 (5 rows for a Controller) and EXC-015 (1
>    row), and `exception-view.ts:566-569` falls back to "No operational events in evidence for this
>    item" with no scope qualifier. The correct pattern already ships as `ScopeNotice`.
> 3. **The deployed product is not this product.** `master` is **47 commits ahead of origin**, so
>    inventory.dogsled.dev still serves the pre-Stage-A build. `QA_RELEASE_GATE.md` still describes
>    it: 628 tests / 47 files / 14 routes, and claims `/evidence` is unbuilt.
>
> Every fix-validation record carries the command that was run and its real output:
> `.claude/projects/C--dev-Inventory-Close/<session>/subagents/workflows/wf_e6105877-98d/journal.jsonl`
>
> ---
>
> ### The five things that cost the most to learn, and must not be re-derived
>
> **0. A validation pass is worth a validation pass, and a test must be shown to fail first.**
> Closing the fleet's tail meant writing the regressions the tail asked for — and one of them found
> that the fix it was validating had set its marker on three of four routes and missed the fourth,
> which was the route the finding's own worked example runs through. **Two levels deep, the same
> class was still there.** Worse: the first version of that test made two `answerQuestion` calls and
> passed against a deliberately reintroduced defect, because each call builds its own session. Its
> premise did not hold, so it could not fail, and it would have shipped reading like proof. Mutate
> the source, watch the test go red, and only then trust it.
>
> **1. A fix pass reopens defect classes at roughly the rate the original code created them.**
> Measured, not suspected: the fix-validation fleet returned **64 findings over the eight fix
> commits, 21 of them CLASS_REOPENED**. The author is looking straight at the class and ships a fresh
> instance of it anyway — twice with `git blame` naming the fix commit as the author of the surviving
> defect. **Budget a validation pass after every remediation.** It is not overhead; it is where a
> third of the defects are.
>
> **2. A regression written by the fix's author inherits the fix's blind spot.** Three tests written
> alongside these fixes later failed *because they had encoded the defective behaviour* — one
> asserted that recording a conclusion suppresses the outstanding-record instruction, which was the
> defect. Write the assertion as a biconditional against the service on the same run, and have
> someone else's pass check it.
>
> **3. A property test over one workspace state is a property test over one workspace state.** The
> scope-channel guard advertised itself as "over every intent and every role"; it ran only against an
> untouched workspace, so a leak needing a saved draft passed it. The defects in this product live in
> the DIVERGED state — after a conclusion, a draft, a submission — and a check that reads only the
> baseline reports the product clean. Drive every such guard over a worked state too.
>
> **4. A verdict must be forced to match its reasoning.** The first verification pass returned 90 of
> 90 CONFIRMED, including a skeptic that wrote a refutation in its correction field and voted
> CONFIRMED anyway. Stating the burden once and symmetrically — with no warning against either pole,
> because warning against one installs the other — and offering `ALREADY_FIXED` as a first-class
> verdict produced 3 real refutations and ten severity reductions on the next run.
>
> ---
>
> **Operational, and it will bite immediately:** run the suite as `npx vitest run --maxWorkers=3`.
> At default concurrency vitest OOMs on this machine — `AlignedAlloc Allocation failed`, ~3 s in, at
> a 64 MB heap, which is system memory rather than a heap limit. `pnpm test` also exits 1 on a known
> `onTaskUpdate` reporter RPC timeout; read the `Tests` line, not the exit code.
>
> The section below describes the state before that review. It is still accurate about the code
> except where `1e06d58` changed it.

## 0b. Stage G is shipped, and its §0 remediation with it

> **Stage G landed in `7333663`** — the Ask Gaurd matcher hardening, the routing-identity
> harness COMPLETION_PLAN §3.9 required, eleven new tools and twenty-one new intents.
> Tests **1,010 → 1,690**; typecheck, lint and production build clean; locked baseline
> unmoved and confirmed in a browser. **No review has been run over it.** Run one, using
> the corrected method below, and then review the remediation too.
>
> **`STAGE_G_REVIEW_PLAN.md` is the ready-to-run plan** — eleven lenses designed by six independent
> vantages over the diff, with per-lens false-positive lists, coverage gaps and run order.
>
> **Its §0 four defects are FIXED** (2026-08-12), including the P1, each mutation-tested. **§0.5 of
> that plan records five more found while fixing them** — three of which no lens brief covers,
> including "withheld by your access scope" printed to a CONTROLLER on 40 of the 1,500 serials, and
> the flagship Procurement card contradicting its own narrative. Two of the five were found only by
> opening the page as the auditor. **The eleven lenses have still not been run**; that is the task.
> Read §0.5's two method notes first — they change how lenses 5 and 8 should read their results.
>
> **Five things that cost real time and should not be re-derived:**
>
> 1. **Measure before scoping.** The stage's real size was not in the plan: routing every
>    shipped chip through the engine before writing anything showed **22 of 54 refused**.
>    That number set the scope, and it came from twenty lines of throwaway script.
> 2. **A hand-copied population goes stale silently.** The stage-08 test that was supposed
>    to prevent refusing chips listed thirteen of them, copied from screens that had since
>    grown to seventeen. `ask-chips.test.ts` now derives the list from the component tree.
>    Any test whose population is a literal array is a test with an expiry date nobody set.
> 3. **Do not add `\b`; make it unforgettable.** The §3.9 mis-route was an unanchored
>    regex. Intents now declare phrases and `matching.ts` compiles the boundaries, so the
>    defect cannot be expressed — and one test asserts the property over every phrase,
>    including phrases added after it was last read.
> 4. **Writing the tests found the P1.** `inboundAgrees` compares a scope-filtered document
>    side against an unscoped book side; probing per role to write an assertion is what
>    showed it returning `false` for every auditor, which the Procurement screen printed as
>    an unexplained control difference. Nothing else would have surfaced it: it is invisible
>    as the Controller, and the Controller is who every earlier test was.
> 5. **Ask Gaurd answered from the BASELINE close, not the live one — now DECIDED, and partly
>    done.** `list_open_exceptions` and `get_blocking_conditions` read `ws.close`, so a conclusion
>    recorded in the session moved every screen and no answer. The Stage G review found this as
>    four P0/P1 findings (`G24`, `G25`, `G26`, `G27`) plus `G28` and `G29`, and `1e06d58` resolved
>    the decision: **the drawer answers from the live close and names the baseline as the
>    baseline.** It cost two tools, both one-line delegations to query-service projections the
>    screens already read — `get_effective_close` and `get_exception_workflow`. `G24` and `G25`
>    are fixed; **`G26`, `G27`, `G28` and `G29` are the same two tools away** and are the highest-
>    value items left in the tail.

The original ten stages shipped and deployed. The work in flight is a **product-completion
and accounting-credibility pass** driven by the owner's brief plus an independent 15-agent
critique of the live site. `COMPLETION_PLAN.md` holds the current-state audit, the staged
sequence A→H, the golden-test traps, and the D1–D12 decision register with each outcome.
Everything in §0 below still applies (it describes the ten stages and the locked baseline) —
but the *next task* is here, not in §8.

| Stage | State |
|---|---|
| **A — Credibility** | ✅ Done (`53769b5`, `cb73e2b`, `98688a5`, `8718d3e`) |
| **B — Inventory & GL** | ✅ Done (`3a359e7`, `de41445`) |
| **W — Workflow verbs** | ✅ Done (`de41445`) |
| **C — Procurement** | ✅ Done (`2cfb216`) — and it carried the **one** D5 regeneration for C/D/E |
| **Export affordance** | ✅ Done (`32f6856` + `546e388`) — every population now has a way out |
| **D — Costing** | ✅ Done — `/costing`, four tabs, eleventh export table, no dataset work |
| **E — Ownership & valuation lifecycle** | ✅ Done — `/custody` (3 tabs) + E&O methodology on `/valuation`, twelfth export table |
| **F — Management outputs** | ✅ Done (`f900e79`, `8f0a827`) — `/methodology` (4 tabs) + `/close-memo` (2 tabs), the accounting matrix, two more export tables |
| **Stage F review** | ✅ Done (`b1ccdc4`) — 9 lenses, 26 confirmed defects fixed |
| **Remediation review** | ✅ Done (`406baaf`) — 4 lenses over `b1ccdc4`; 11 more fixed, 2 refuted |
| **G — Ask Gaurd tools** | ✅ Done (`7333663`) — matcher, harness, 11 tools, 21 intents |
| **Stage G §0 remediation** | ✅ Done — the plan's four verified defects + five found fixing them |
| **Stage G review** | ✅ Done — 14 lenses, 96 raw → 78 groups. Stopped at a spend limit with 30 unjudged; all 68 later re-judged at HEAD |
| **Stage G fix pass 1** | ✅ Done (`1e06d58`) — G66 verified, 4 P0s + G01/G02/G03 fixed, G39/G42 closed with them |
| **Stage G fix pass 2** | ✅ Re-verification done (12 agents, 68 findings) — G67, G74, G75 fixed. See STAGE_G_REVIEW_STATUS.md §0b |
| **Stage G fix pass 3** | ✅ Done (`b1cf8aa`) — the baseline-vs-live family closed; G28 fell out with it |
| **Stage G fix pass 4** | ✅ Done (`bbbcdca`, `9b62dcd`, `73a7e3c`, `5cfeb20`) — **every P0 and P1 closed** |
| **Fix-validation fleet** | ✅ Done — 11 agents over the eight fix commits: 64 findings, **21 CLASS_REOPENED**, 132 cleared |
| **Fix pass 5** | ✅ Done (`8881db5`, `ed76212`, `bcb11f6`) — 17 of the 64 fixed, including a comment citing a test file that did not exist |
| **Fix pass 6 — the 48-item tail** | ✅ Done (`a4b4e6f`) — all 47 distinct items; the tail's own new test found a fourth route the fix it validated had missed |
| **The review's own 44-item tail** | ⬅ **NEXT.** 27 P2 + 17 NOTE from `G01…G96`, clustered by file in `STAGE_G_REVIEW_STATUS.md` §0d |
| H — QA | Not started |

**2,488 tests across 73 files passing**; typecheck, lint and production build clean, 20 routes.
Run the suite as `npx vitest run --maxWorkers=3` — the default worker count OOMs on this machine.
The locked financial baseline has not moved and is verified in a browser, not only in tests:
1,500 units · $4,800,000 subledger · $4,812,450 gross GL · $12,450 difference · 15 exceptions ·
7 blockers · $198,950 exposure · 81.42% readiness · 17/21 PBC · 91.67% source health.

Before touching anything: `pnpm typecheck && pnpm lint && npx vitest run --maxWorkers=3 && pnpm build`
— **`pnpm test` at default concurrency OOMs on this machine** — and
**stop any `pnpm dev` server first** — running a build alongside one corrupts its cache and
the next request 500s on a missing vendor chunk.

---

### How to run a fleet review here — the corrected method

Distilled from five fleets now — two Stage F reviews, Stage G's fourteen-lens review, its
re-verification, and the fix-validation pass over the fix commits. Where this contradicts §6, §6 is
the older design and was wrong.

**Run the loop three times, not once: find → fix → VALIDATE THE FIX.** The third pass is the one
that keeps getting skipped and it is the one with the best yield. Eleven agents over eight fix
commits returned **64 findings, 21 of them a defect class the fix itself reopened.** Two were caught
by `git blame` naming the fix commit as the author of the surviving instance — so tell the validators
to use blame explicitly. A fix pass is new code written fast by an author who has just convinced
themselves they understand the problem; review it like any other new code.

**Commit the stage first.** Reviews are long-running background work, and three host exits during
stage 06 each stranded an uncommitted tree. The stage lands, then the remediation is its own
commit — and then **the remediation gets reviewed too**. That last step is not optional: the pass
over `b1ccdc4` found a P1 in it, in code written by the session that had just fixed 26 defects.

**The shape:** finder lenses in parallel → dedupe → **skeptics per finding** → apply →
**validate the fixes with a fresh fleet** → re-run the gate → browser pass → commit.

**Give a verdict enum every outcome the run can actually produce**, or agents will force a real
result into the wrong bucket. `HOLDS / REFUTED / ALREADY_FIXED / UNCERTAIN` worked; without
`ALREADY_FIXED`, a finding the fix commit had already closed would have come back HOLDS or REFUTED
and both would have been wrong. Bucket dead agents separately too — `uncertain: 30` once hid a P0
behind a word that means "we looked and could not tell", when nothing had looked.

**State the burden ONCE and symmetrically, and force the verdict to match the reasoning.** The first
run returned 90 of 90 CONFIRMED — including a skeptic that argued for refutation in its correction
field and voted CONFIRMED anyway. The fix is to name that failure in the prompt, quote it, and
require the verdict field to follow the analysis. That single change produced 3 real refutations and
ten severity reductions on the next run.

**Both skeptics carry the SAME burden of proof**, and may answer **CONFIRMED / REFUTED /
UNCERTAIN**. They differ in ANGLE, never in standard: one works from the mechanism (does the code
actually do this?), one from the consequence (does it reach anyone, and is it worth an edit?).
The first run instead told one to default to refuted and the other to report only what it
reproduced — opposite calibrations, so 26 of 32 findings piled into "contested" as a pure
artifact of the prompts and the tally carried no signal at all. With one burden and an UNCERTAIN
option, the second run returned 11 confirmed, 2 refuted, **0 contested**.

**Then run a second fleet over the proposed FIXES before editing anything.** One validator per
item: re-derive the fact at HEAD, then stress-test the fix — does it break a locked figure,
contradict a load-bearing decision, trip a registration trap, or **create a new instance of the
defect class it closes**? All 27 came back needing changes, and five original fixes were rejected
outright for that last reason.

**Ban writes explicitly in every agent prompt** — no file creation anywhere, no `>` / `>>` /
`tee`, no state-changing git, use inline `node -e` printing to stdout. Spelling it out works: 135
agents across three runs left nothing behind, while the stage-07 review left a stray `x.html` in
the repo root. Check `git status --porcelain` after a review and before staging; never
`git add -A`.

**Agents need this to run repository TypeScript.** `tsx` is not on the path and plain `node`
cannot resolve the workspace packages (extensionless `.js` specifiers against `.ts` sources).
Dynamic imports only — a static `import x from` fails under `-e` — run from a package directory
that resolves what you import (`packages/services` sees @icg/services, @icg/rules, @icg/domain,
@icg/data, @icg/permissions; `apps/web` sees the web modules; the repo root sees only
@icg/domain, @icg/data, @icg/rules):

```bash
cd "C:/dev/Inventory Close/packages/services" && node "C:/dev/Inventory Close/node_modules/.pnpm/tsx@4.23.11/node_modules/tsx/dist/cli.mjs" -e "(async()=>{const s=await import('@icg/services');const ws=s.createWorkspace();console.log(JSON.stringify(Object.keys(ws)))})()"
```

**Spend one lens on the stage's own authored interpretations**, named explicitly, told its job is
to find where the author was wrong. Stage F's found both P1s — each was authored prose
contradicting the data underneath it.

**Add a lens that tries to BREAK the stage**, reporting only attacks it observed succeeding.
Stage 08's found five guardrail bypasses a code-reading lens had called defensible.

**Verifying a role- or export-scoped fix does not need the browser pane.** The pane may fail to
composite frames, which kills screenshots and coordinate clicks. `curl -H "Cookie: icg-role=U-009"`
against the dev server exercises the real exporter as the real role, and driving React through
its native value setter in `javascript_tool` exercises the real component. Both were how the
close-memo P1 and the unsaved-edits P1 were confirmed live.

**The synthesis agent only sees findings that SURVIVED**, so its "coverage gaps" will list areas
other lenses examined and cleared. Read the per-lens raw output in the run's `journal.jsonl`
before believing a gap is real. Journals live under
`C:\Users\dough\.claude\projects\C--dev-Inventory-Close\<sessionId>\subagents\workflows\*\journal.jsonl`;
a journal only gains a `{"type":"result"}` line when an agent **finishes**, so a run whose host
died mid-flight leaves nothing recoverable and must be relaunched.

**If verifiers die on a usage limit, their findings are unverified, not refuted** — adjudicate
them inline rather than trusting the tally.

---

### Stage G — what it built, and what a review of it should attack

`packages/ai` only; **no data work** — D5 was spent by Stage C and the dataset stays
**`FY2026-DEMO-v1.2.0`** (hash `9f39105d…`).

**What landed** (`7333663`):

- `packages/ai/src/matching.ts` — intents declare **phrases**, the compiler adds the word
  boundaries. `intentPhrases` exposes every phrase so one test asserts the whole-word property
  over the table. A stem marker (`reconcil*`) keeps lists short without loosening the LEFT
  boundary, which is where §3.9's mis-routes came from.
- `routeQuestion` is exported AND used by `answerQuestion`, so the harness and the engine cannot
  disagree about what the table says. `AiInteraction.route` records which handler actually
  answered — asserting on the recorded route rather than on a re-derivation matters, because the
  fallbacks mean a question can match one intent and be answered by another.
- **Twenty-one new intents**, ordered specific-before-general. Order IS the disambiguation.
- **Eleven new tools**, each a one-line delegation to a Stage B–F projection through the new
  `createProjectionService` in `packages/services/src/projections.ts`. That module exists so a
  tool handler is never handed a workspace: it is a separate module rather than more methods on
  `createQueryService` because `procurement.ts` and `ownership.ts` import `makeRecordScope` from
  `queries.ts` at runtime, and a permission boundary should not rest on an import cycle
  resolving.
- **Draft mode is real.** The memo intent returns `AiDraftSection[]` — wording only, checked by
  `statesQuantity` / `namesRecordIdentifier`, the same functions `checkNarration` uses. Not a
  second copy: `guardrails.ts` exports them and both callers share the one definition.
- `ask-view.ts` words canonical values using a map assembled from the modules that already own
  each vocabulary (`CUSTODY_LABELS`, `METHOD_LABELS`, `COMPONENT_LABELS`, `statusView`,
  `pbcStatusView`, `holderLabel`, `classificationLabel`, …). Nothing is restated there.

**The review brief — what to read, and what it costs.** `git show --stat 7333663` is 31 files,
3,595 insertions. The weight is in six files:

| File | Lines | What a reviewer needs to know |
|---|---|---|
| `packages/ai/src/answers.ts` | 2,319 (+2,132) | The intent table. 33 intents in one ordered array, first match wins. Every authored management-conclusion sentence lives here. |
| `packages/ai/test/routing-identity.test.ts` | 370 | 409 assertions: whole-word property over every phrase, probe→intent identity, reachability, figure-source, ungrouped-count. |
| `packages/ai/test/stage-g-regressions.test.ts` | 367 | Draft-prose guards, the measured-boolean biconditionals, the scope-as-finding pins. |
| `apps/web/test/ask-chips.test.ts` | 265 | Chip population derived from the component tree; the canonical-token universal. |
| `apps/web/lib/server/ask-view.ts` | +180 | The canonical-label map and `humanizeCanonical`. |
| `packages/ai/src/matching.ts` | 154 | The phrase compiler. Small, load-bearing, and the thing every intent depends on. |

**Model:** run the fleet on **Opus 5**, not Fable 5. Fable's documented bug-finding gains
**exclude security-focused analysis** — which is where several of the most productive lenses here
sit (permission boundaries, auditor scoping, redaction) — it is the more classifier-sensitive of
the two (a refused agent returns null and its lens silently drops from the tally), it wants *less*
prescriptive prompts than this method deliberately writes, and it costs 2x. Consider Fable only for
the synthesis/adjudication agent, where the reasoning is hardest and the agent count is one:
`agent(prompt, { model: 'fable', effort: 'max' })`. Loosen the brief if you do.

**STOP — Stage G shipped with a P1, and the review plan already names it.** Designing the review
lenses turned up defects before the review itself ran. Each was verified directly against the
workspace, not taken from an agent's report. Read `STAGE_G_REVIEW_PLAN.md` §0 before anything else:

- **The stage fixed ONE consumer of the scope-shortened order array and left its siblings.**
  `inboundAgrees` became `boolean | null`; `ordersCompared` (84 vs 83), `closeReviewRequired`
  (1 vs 0), `nativeIncomplete` and `divergent` all still render to an auditor as completed
  measurements. Worse, `receivedInPeriod` reads a scope-filtered receipt, so **PO-26-1201 enters the
  auditor's invoiced-not-received population as a cutoff finding that does not exist** while
  PO-26-1187 leaves — the row COUNT stays 4 for both roles and nothing on any surface shows the swap.
  This is §7's own lesson turned on its author: correcting one sentence leaves the shape that staled it.
- **Two figures cite a tool they were not read from.** `pbc` and `blockers` source
  `readiness.aggregates` values to `get_pbc_status` / `get_blocking_conditions`, and Stage G's new
  figure-source test passes over them because it asserts SET MEMBERSHIP rather than identity — this
  repository's own "cardinality assertion standing in for an identity one", sitting inside the
  harness that carries the stage's headline claim.
- **Four scope distinguishers are computed and never read**: `lineageInScope`, `withheldCount`,
  `scopeReduced`, `managementLensInScope`. Each exists solely to keep "withheld from you"
  distinguishable from "there is none".
- **Draft prose is guarded only in a test.** Nothing in production runs the quantity/identifier check
  the commit message says governs it.

The eleven lenses, their per-lens false-positive lists, the coverage gaps and the run order are in
`STAGE_G_REVIEW_PLAN.md`. They were designed by six independent vantages over the diff rather than by
the stage's author — deliberately, because an author naming their own blind spots is the failure mode
this repository keeps finding.

**Where to attack it.** These are the places the author knows are soft:

- **Intent ORDER.** Thirty-three intents in one table, first match wins. Every probe is asserted,
  but a question nobody wrote a probe for can still be claimed by the wrong intent. Read the
  table looking for a phrase that belongs to two topics.
- **Authored prose beside a measurement** — Stage F's measured root cause, and Stage G wrote a
  lot of it. Every management conclusion that names a population should be derived from it or
  asserted against it; `stage-g-regressions.test.ts` does that as biconditionals for six of them.
  Find the ones it does not cover.
- **`AiFigure.text` carrying composed values.** Several new intents put counts and dates into
  `text` (`"IR-27-0007 · 3 units · 41 days outstanding"`). No money goes in there, which is the
  rule that matters — check that it holds everywhere.
- **The baseline-vs-effective gap** named in §0a. Every intent inherits it.

**Two rules `packages/ai` keeps that nothing may relax:**

- **Narration may not carry figures OR record identifiers at all**, and now neither may Draft
  prose. Five guardrail bypasses came from trying to decide whether a number in prose was the
  right one; that comparison is not reliably decidable across spellings and phrasings, so it is
  not attempted. Quantities and ids belong to the structured answer.
- **An enumerated denylist is not a category.** Every confirmed Ask Gaurd defect in the full-tree
  review was a guard listing the phrases somebody thought of. Add the category and a test that
  iterates it — writing those tests found two further holes in the first version of that fix.

**Every tool takes the caller's `ServiceContext`**, so authorization, restricted-content
redaction and auditor scoping are inherited from `@icg/services`. A tool that builds its own
context or reads the workspace directly bypasses all three silently.

**The pattern to follow**, established by Stage B (`glAccounts.ts`), C (`procurement.ts`),
D (`costing.ts`), E (`ownership.ts` + `eoMethodology.ts`) and F (`methodology.ts` + `memo.ts`):

1. A read-only projection in `packages/services/src/<name>.ts` taking `(ws, ctx)`, calling
   `authorize(ctx.user, …)`, scoping source documents with `makeRecordScope` where the
   collection carries a `sourceRef` — and saying in the module doc when it does not, rather
   than omitting the call silently. Exported from `packages/services/src/index.ts`.
   **A COMMAND surface** (Stage F's `saveMemoDraft` / `issueMemoVersion`) additionally needs a
   permission key in `packages/permissions`, a runner in `lib/server/workflow-actions.ts` that
   goes through `fail()`, a server action, and an entry in **all four**
   `vi.mock("../app/actions")` factories (`close-loop`, `ask-gaurd`, `stage09`, **`overview`** —
   the fourth was undocumented until Stage F and was already missing `recordSignOff`).
2. `apps/web/lib/server/<name>-view.ts` — formats and labels; never sums money.
3. The screen component + `app/<route>/page.tsx`, with `?tab=` deep links.
4. `apps/web/lib/nav.ts` — an 18th entry. `apps/web/test/shell.test.tsx` pins the label array
   AND its "seventeen sections" test name; both must move together, and the name is a string that
   will not fail on its own. Pick a label that is **not a substring of another label**:
   `shell.test.tsx` builds `new RegExp(s.label)` unescaped and `getByRole` throws on ambiguity
   (Stage F's regressions now pin that no label is inside another).
   `AppShell` matches `aria-current` by exact string equality against the `section` prop, so the
   screen's `section` must byte-match its nav label.
5. **An export table**, if the screen owns a population. `apps/web/test/export-affordance.test.tsx`
   fails if a new screen has none, or if `EXPORT_TABLES` gains one nothing links to. Add the
   branch in `export-csv.ts`, the `ExportCsvLink` on the screen (gated on `!data.restricted`),
   the entry in that test's `SCREENS` array, **and an `AUDITOR_SCOPE_NOTES` entry** — `null`
   unless the table genuinely withholds, since a note claiming a redaction that did not happen
   is itself a failure that test catches. Where the withholding is CONDITIONAL (the memo withholds
   only when an unissued draft exists), the static note stays `null` and the file states the count
   inline, so it can never claim a redaction that did not happen on this run.
6. Regressions that pin rules rather than strings, then **mutation-test them** before shipping.

**A new `Workspace` collection had nine registration sites and now has four**, three of which
fail loudly. Add the field to the `Workspace` interface, initialise it in `createWorkspace`, add
it to **`WORKING_STATE_COLLECTIONS`** in `packages/services/src/workspace.ts`, and bump
**`WORKSPACE_SHAPE`** in `apps/web/lib/server/workspace.ts`.

`WORKING_STATE_COLLECTIONS` is now the single source for what Reset Demo clears, what it reports
clearing, what the audit trail records it cleared, and what `REPLAY_EXCLUSIONS` says the
reproducibility check does not cover — four hand-written enumerations of the same names, which
had already drifted: the replay-exclusion sentence named four collections while the workspace
held six, so **the one disclosure whose job is to say what a check skipped was itself skipping
two**. Missing the list is a **compile** error (`UnlistedWorkingState`), and `memo.test.ts`
cross-checks it at runtime against the workspace's own array-valued keys, because a type-level
assertion can be defeated by a cast.

**`WORKSPACE_SHAPE` is still the one that can only be caught by opening the page** — the dev
server caches the workspace across module reloads, and tests build a fresh one per test.

**Stage E's adversarial review found 14 of its 23 confirmed defects IN THE NEW TESTS.** Four
shapes to check your own regressions against, because mutation-testing the obvious ones did not
catch these:

- **A conjunction whose terms are never broken separately.** `outsideSubledger = heldOffBook &&
  subledgerIsBookPopulation`; the created-condition test pushed a normally-costed unit, which
  broke BOTH terms at once, so the first was never shown to be load-bearing. Break each term
  alone (here: a zero-cost unit).
- **A tautological conjunct hiding a live one.** `coversBook` compared a row sum against
  `bookUnits` — always equal, because the derivation is total — so the flag could not go false
  for the reason its own false-branch text named.
- **A cardinality assertion standing in for an identity one.** `metAge.length > metBoth.length`
  constrains neither flag; hard-coding `metAgeTest: true` passed it. Assert WHICH.
- **A loop whose iteration count comes from the output under test.** The location-name test
  filtered the expected list by what the screen rendered, so an empty screen emptied the loop and
  the test went green having checked nothing. Assert the loop ran.

**Two shapes Stage F added to the list, both found by mutation-testing my own tests:**

- **An assertion on a branch that does not exist.** The first refusal test asserted the memo body
  survived a refused *save* — but nothing on the save path clears the editor on either outcome, so
  it would have passed whatever the component did. Before writing "X survives Y", check that
  something in the code could have destroyed X.
- **A comparison that has not happened is not a negative result.** `positionMoved` is `null`
  before anything is issued, never `false`: "the position has not moved" is a claim about a
  comparison against a sealed hash, and there is no hash yet.

**Five more from reviewing the remediation (`406baaf`) — all found in tests written the same
session that fixed 26 defects, which is why that review existed:**

- **A guard must compare on the normalisation the writer applies.** The unsaved-edits check
  compared raw editor state against a draft the command stores `.trim()`ed, so whitespace became
  an edit that saving could not clear — refusing a control the service would have accepted. When
  a UI compares against stored state, match the store's normalisation exactly.
- **`useState` seeds once, and props arrive later.** The memo editor was seeded at mount, but an
  auditor is not shown the working draft and a role switch is a props update, not a remount — so
  the editor held its placeholder while `data.draft` held the real thing. Re-seed on an identity
  change, guarded so text the reader touched is never discarded.
- **An offer must carry EVERY gate the command carries.** `issueMemoVersion` authorizes before it
  checks the period; gating the prose on the period alone still prescribed the act to roles the
  first gate refuses.
- **An existential standing in for the universal the test's own NAME claims.** "emits every
  section heading as a boundary" enforced by `toBeGreaterThan(0)`: rename one heading so the
  splitter stops seeing it and the count stays plausible. Name the set; a count is satisfied by
  the wrong set of the right size, and only a named list catches a heading deleted outright.
- **A conditional branch whose only live assertion tests wording the commit already changed.**
  The completeness check was gated on "does the file carry every sealed body" — false on every
  run — so its one assertion was a regex for a sentence that no longer existed. Derive the
  assertion from the population, not from a phrase.

Two smaller ones worth keeping: a regex over source text is an **allowlist of syntax** and can
never be complete, so pair it with a guard that makes an unread form loud (`count of /^export /`
must equal what the scan parsed); and `process.cwd()` in a test breaks running vitest from a
package directory — use `__dirname`.

**Reusable pieces in `apps/web/components/kit.tsx`:** `StatStrip` (Stage E), and `ClaimPanel` +
`FactRows` (Stage F) — each moved there when it was about to be copied a third time. `ClaimPanel`
is the shape for any ✓/✕ panel whose sentence comes from a measured boolean; `FactRows` is the
label/value table for values that are sentences rather than figures. Display wording that two
surfaces must agree on belongs in `lib/server/humanize.ts` (`holderLabel` joined it in Stage F,
after living in the custody view and the exporter).

**Traps that have cost real time in this pass** (§7 has the full list):

- `WORKSPACE_SHAPE` in `apps/web/lib/server/workspace.ts` must be bumped for a new `Workspace`
  field **or a new dataset version**. The dev server caches across module reloads, tests build
  a fresh workspace each time, so neither failure is catchable by the suite.
- **Four** test files mock `../app/actions` with a factory — `close-loop`, `ask-gaurd`,
  `stage09` and `overview`. A component importing a new action fails there until the factory
  lists it. An omitted export is **not** `undefined`: vitest wraps the factory in a proxy that
  THROWS ``No "<name>" export is defined`` the first time anything reads the missing name. The
  omission is therefore lazy rather than silent — it survives exactly as long as no test reaches
  that control, which is how `overview.test.tsx` rendered the screen importing `recordSignOff`
  for four stages without failing. **`test/actions-mock.test.ts` now fails if any factory stops
  listing every export**, and re-derives the four-file list from the tree so a fifth cannot be
  added uncovered. The comment in each factory was the enforcement before, and a comment is not
  one.
- `.click()` does not flush React state in jsdom — use `userEvent`.
- A `.tsx` test without the `// @vitest-environment jsdom` docblock fails obscurely.
- Money figures in a CSV must be bound to their label in tests. `toContain("7")` passes on
  almost any file; assert the value sits in the row its label heads — and use the app's own
  `formatCents`, never a hand-rolled `toLocaleString`, which drops non-whole cents ($67.50).
- `apps/web/test/no-hardcoded-totals.test.ts` scans `app/`, `components/` and `lib/` for the
  canonical literals — **including inside comments**. Stage D tripped it twice by writing
  "$4,800,000" in a doc comment. Say "the inventory subledger" in the web app and let the
  figure arrive from services.
- A condition the baseline cannot produce is a condition your regression does not test.
  Stage D creates two in-test (a unit carried off standard, a period-cost account pushed into
  `glBalances`) because without them a projection that hard-coded either boolean would have
  passed the entire suite. `createWorkspace()` calls `buildDataset()` afresh, so mutating
  `ws.dataset` inside a test is isolated to that test.

**Verify in a browser before calling it done.** Eight defects this pass shipped past a green
suite and were caught only by opening the page — and one of Stage F's three could not have been
caught any other way, because the demo baseline clears zero of everything and the plural only
appears once a reader has done a piece of work. Stage F's three: a closing note saying the
readiness figure is "derived from the tier rules **below**" when they render above it; a
Methodology register showing raw enum values (`COMPANY_WAREHOUSE`, `NOT_EXPECTED`) on one tab
while the tab beside it showed "Company warehouse" and "Not expected" — one fact, two
vocabularies, on one screen; and a reset report reading "1 close-memo versions", a plural the
whole sentence had hard-coded and that nothing revealed while the demo baseline cleared zero of
everything. The earlier five: a card showing two different amounts under a
footnote calling them matched; a cached workspace serving an empty population; (Stage D) a
sentence saying the stack "sums to $4,800,000 — the same $4,800,000 the close reconciles TO the
general ledger", which reads as agreement when the whole product exists to show a $12,450
difference; and (Stage E) unit counts rendering as `1500`, plus **every location on every screen
falling back to a title-cased id** — "RMA / Repair" shown as "Rma Repair" — because
`registerLocationNames` was guarded by a flag on `globalThis` while the map it fills lives in
`humanize.ts`. A dev-server module reload gave the map a fresh empty instance while the flag
stayed true, so registration never ran again. **A guard must live in the same module as the
state it guards.** Fixed by registering unconditionally in `getQueries()`; the flag was never
worth its own bug. No test could catch it — a test process registers correctly on its first
call — which is exactly why the browser pass is not optional.

**Known, pre-existing, and NOT caused by any stage:** `pnpm test` exits 1 while reporting every
test passed. The error is `[vitest-worker]: Timeout calling "onTaskUpdate"` — a reporter RPC
timeout, not a test failure. `export-affordance.test.tsx` renders every screen for every demo
user in one test that blocks its worker for ~45s and starves the reporter channel; each new
stage adds a screen to that sweep. It reproduces at `546e388`, before Stage D. Read the
`Tests` line, not the exit code — and if you fix it, split that sweep rather than raising a
timeout.

---

### The standing rule this pass keeps re-learning

**A surface may never make a claim more precise than what it enforces, and an absence must be
stated rather than implied.** Every adversarial review has confirmed this root cause more than
any other. Recent instances: an auditor "Scope" line chosen by ROLE and printed on four files
where nothing was withheld; a CSV column asking the raw fixture for a field it does not have
and emitting 1,500 empty cells; the Overview claiming "each section below exports its own";
a count line covering a SKU and location reported as that unit's own variance.

Two habits that follow from it, and are worth keeping:

- **Watch for coincidences.** All 7 open exceptions are blockers on this baseline, so a test
  counting 7 BLOCKER cells passes against a column derived from `open`. When the data cannot
  distinguish two sources, pin the SOURCE and say in the test why.
- **Mutation-test your own regressions.** Six confirmed findings across the last two reviews
  were defects in brand-new tests, found by deliberately breaking the source to see what
  stayed green. Do that before shipping a test.

---

## 0. Start here

**All ten code stages are COMPLETE, licensed (MIT, owner's choice), and tagged
`v1.0.0-demo` at `868b072`. Both final data passes are COMPLETE** — pass 1 (adversarial
data, 49 agents, 10 defects fixed at `fb496a0`) and pass 2 (highlight-set validation,
42 agents, all highlights valid and consistent; wording/staleness fixes in the close-out
commit). The release gate is recorded in `QA_RELEASE_GATE.md` (no P0 open), including the
**register of documented spec conflicts**: the EXC-001 count rows forced by §6's locked
1,061/4 against §8's locked delivery timeline were **accepted by the owner (2026-08-10)
as a documented tension** — do not "fix" them; two P3 wording splits remain open.
Never resolve any register item by silently changing a locked value.

**Push public / deploy is DONE.** The next task now lives in §0a and `COMPLETION_PLAN.md`.
Before anything else:

1. Read §0a, then `COMPLETION_PLAN.md`, then this document, then `CANONICAL_SPEC.md`, then
   **`design/IMPLEMENTATION_HANDOFF.md`** (component/reuse map, geometry, interaction rules,
   accessibility, demo states, and the mockup defects in §9a you must correct rather than
   replicate).
2. Verify nothing drifted: `pnpm typecheck && pnpm lint && npx vitest run --maxWorkers=3 && pnpm build`
   — expect **2,488 tests across 73 files passing** (833/59 was the stage-09 figure). **Stop any `pnpm dev` server first** (see §7).

**All four adversarial reviews are done.** Full tree at `f3f6f98` (12 lenses, 9 fixed —
eight lenses examined their area and found nothing; that is a result, not a gap). Stage-10
public surface at `e3c952e` (7 lenses, 76 agents, 27 fixed). Final data pass at `fa3526b`
(8 lenses, 49 agents, 10 fixed). Highlight validation at `fb496a0` (8 verifiers, 42
agents, no figure failed — wording fixes only). See `QA_RELEASE_GATE.md` for all records.

---

## 1. What this project is

An independently created prototype: a Controller-oriented **evidence and close-control layer
on top of NetSuite** for the fictional company KestrelGrid AI, using fully synthetic FY2026
data (balance-sheet date 2026-12-31). NetSuite stays the system of record; operational systems
establish physical facts; Gaurd reconciles those to accounting evidence and answers:

> What is the complete financial story of this physical unit, and does the year-end accounting
> agree with the evidence?

Architecture slogan: **Deterministic Core, Generative Edge.** The LLM may explain a control
result; it may never create one. If AI disappears, the close still works.

**`CANONICAL_SPEC.md` is the authoritative cross-document specification.** `docs/00`–`docs/16`
expand it; `prompts/code/00`–`10` and `prompts/design/00`–`07` are the staged build prompts;
`golden/baseline.json` holds the locked aggregates in integer cents/bps.

---

## 2. Current state (verified after both final data passes)

- Repo: `C:\dev\Inventory Close`, branch `master`, published at
  **https://github.com/dogsleddev/inventory-close** (public; `origin` tracks `master`,
  which is the default branch; `v1.0.0-demo` tagged and pushed).
- Node v24.14.1, pnpm 11.5.3, Windows/PowerShell.
- **1,010 tests across 69 files passing** (was 628/47 at the original release; the completion
  pass added the rest); typecheck, lint, and production build all green — **20 routes**, with
  `/api/export/[table]` serving fourteen tables.
  `pnpm typecheck` now also runs `tsc --noEmit -p test/tsconfig.json` for the repo-wide QA
  scans; the four-command gate is unchanged.
  (Stage 06's handoff recorded 376 at `e18d94e`; the tree actually ran **375** there — an
  off-by-one in the note, not a skipped test.)
- All 44 `SPEC_MANIFEST.json` hashes match disk — the spec package is pristine.
- Committed dataset hash: `9f39105de59cb0c86ce494512d4c9498c886d21f128fe6607bb935db64cc0bcc`
  (`FY2026-DEMO-v1.2.0`, moved by the Stage C regeneration; the locked financial baseline did
  not move). The prior v1.1.0 hash was `672d7349c616…`.

### Stage status

| Stage | State |
|---|---|
| Design 00–04 | Done (approved exports committed) |
| Design 05, 06 | Done 2026-08-09 evening |
| Design 07 | **Done** — `design/07_final/ICG-Design-Handoff.html`, distilled into `design/IMPLEMENTATION_HANDOFF.md` |
| Code 00 Kickoff | Done (readiness report; no code) |
| Code 01 Foundation | Done + review-remediated (`9f286d5`, `17ffb31`, `548afd3`) |
| Code 02 Dataset | Done + fleet-reviewed (`31f2765`, `ff89a3b`) |
| Code 03 Rules/Golden | Done + fleet-reviewed — **hard gate PASS** (`e8b7d12`, `cad38bb`) |
| Code 04 Services/Security | Done + fleet-reviewed (`a02bf35`, `5e6a461`, `e0a603b`) |
| Code 05 Core UI | Done + fleet-reviewed (`3a4dc6b`) — shell, Overview, exceptions queue, EXC-001 detail |
| Code 06 Life/Counts/Chains | Done + fleet-reviewed (`ffbb2a8`, `e18d94e`) — Inventory search, Financial Life, Physical Count, Reconciliation chain tabs |
| Code 07 Bridge/Adjustments/Valuation/PBC | Done + fleet-reviewed (`04fe79b`, `36dafe5`) — bridge tab, Adjustments, Valuation, Audit Package |
| Code 08 Ask Gaurd | Done + fleet-reviewed (`2eaab1e`, `e343f2e`, `4552c9b`) — tools, deterministic answers, guardrails, drawer |
| Code 09 Reset/Replay/QA | Done + fleet-reviewed (`38a115c`, `30494c0`) — Reset + Reproduce Close controls, package manifest, `/cutoff` + `/ownership`, `?tab=` deep links, AI-off statement, repo-wide QA scans, `QA_RELEASE_GATE.md` |
| Full-tree review | Done (`30494c0`) — stages 01–09 reviewed together; 9 defects fixed |
| Code 10 Polish/Public/Deploy | Done + fleet-verified (`e3c952e`, `1c85866`) — public README, User Guide, `.env.example`, `apps/web/vercel.json`, `.gitattributes`, 27 verification defects fixed |
| LICENSE | Done — MIT (owner's choice), wired into README + package.json (`868b072`), tagged `v1.0.0-demo` |
| Final data pass 1 | **Done** — adversarial data fleet, 10 defects fixed + category regressions (`fb496a0`) |
| Final data pass 2 | **Done** — highlight validation, all valid/consistent; wording fixes in the close-out commit |
| Push public | **Done** — https://github.com/dogsleddev/inventory-close (public, `master` default, `v1.0.0-demo` tagged) |
| Deploy | **Done** — live at **https://inventory.dogsled.dev** (Vercel `dogsled/inventory-close`, git-connected to `master`) |
| Remaining (original release) | The two open P3 items in the `QA_RELEASE_GATE.md` register, plus the deferred P2s. |
| **Completion pass A/B/W/C/D/E/F + export affordance** | **Done**, and Stage F is reviewed AND its remediation reviewed (`b1ccdc4`, `406baaf`) — see §0a. NOT yet pushed or deployed. |
| **Completion pass G–H** | **G done** (`7333663`), its review not run. Stage H (QA) after that. Neither needs fixtures. |

### Commit history (newest first)

```
406baaf Review the remediation itself: 11 defects fixed, two of them mine
6228a4c Record the Stage F review outcome and hand off to Stage G
b1ccdc4 Stage F review remediation: 26 confirmed defects fixed
8151439 Name both Stage F commits in the review handoff
8f0a827 Drop the assumptions framing, and make the exclusions sentence derive itself
f900e79 Stage F: how each figure is arrived at, and who decided it
9c6b8c6 Stage E review: the coverage flag that could not go false, and 22 more
d1c2fa5 Stage E: who is holding it, who owns it, and what left
2d819f9 Stage D: what a unit costs, and which costs never belonged in inventory
546e388 Close the last export gaps, and stop three files claiming more than they carry
32f6856 Make the way out of the product reachable, and honest about what leaves
2cfb216 Stage C: the procurement section, and the one dataset bump C/D/E all needed
1ed65af Hand off mid-completion-pass: Stage C is next
546fe3a Record Stages B and W as complete
de41445 Stage B + W: the master population, and a close loop that actually closes
3a359e7 Stage B (part 1): per-account GL reconciliation, real JE detail, and a way out
261c18f Record Stage A as complete in the completion plan
8718d3e Stage A (part 4): reconciliation says which side is larger, and the product has a way out
98688a5 Stage A (part 3): the Overview answers its own question, and its figures open
cb73e2b Stage A (part 2): Evidence Center, no placeholders left, guide becomes three journeys
53769b5 Stage A (part 1): domain-aware exception lenses, control-state language, honest verbs
9b07e96 Record the live deployment at inventory.dogsled.dev
5958240 Record the public repo and keep the PDD workflow out of this project
ee5dc83 Accept the EXC-001 count-row tension as a documented decision
3ec9f9a Record both final data passes; fix pass-2 wording findings
fb496a0 Pass 1 data remediation: 10 fleet-confirmed fixture defects fixed
fa3526b Hand off: two final data passes are the next task
868b072 Add the MIT license and wire it into the README and package.json
```

---

## 3. Non-negotiables

### Locked financial baseline — never silently change any of these

Dataset `FY2026-DEMO-v1.2.0` · seed `ICG-FY2026-DEMO-002` · scenario `SCENARIO-EVENTS-v1.1.0`

- 1,500 units / **$4,800,000** gross carrying value
- Gross inventory GL **$4,812,450**; difference **$12,450**; reserve 1290 **($54,000)** separate
- 15 designed exceptions; **7 open / 8 resolved**; **7 blockers / $198,950**; total exposure **$255,650**
- Close readiness **81.42% (8142 bps)**; PBC **17/21 = 80.95%**; source health **91.67%**
- Open blockers: EXC-001, 002, 003, 004, 007, 011, 015
- Reconciling items: EXC-009 −$2,900, EXC-014 +$9,200, EXC-015 −$18,750 → adjusted GL $4,800,000
- Count: population **1,065**, first pass **1,061 matched / 4 variances**, 6 movements, 24+18 test counts
- Stable identifiers: `EXC-001`, `KE-E2-1048`, `SO-26184`, `IF-261972`, `INV-2027-00418`,
  `KE-X1-3498` (EXC-003), `KE-X1-8842` (EXC-004, off-book by design)

### Architecture rules

- Dependency direction: UI / Ask Gaurd / MCP → **services** → **domain/rules** → repositories/evidence.
- `packages/domain` has **zero AI dependencies** and imports no other `@icg/*`.
  `packages/rules` may import `@icg/domain` only. Both are lint- and test-enforced,
  including a relative-path-escape scan and a dependency allowlist.
- Money is **integer minor units (cents)**; readiness is **integer basis points**.
- Rules are pure functions — no clocks, no randomness, no I/O. Results are
  PASS / FAIL / REVIEW_REQUIRED / INCOMPLETE / NOT_APPLICABLE with **coverage separate**
  (COMPLETE / PARTIAL / INCOMPLETE). **Missing required evidence never becomes PASS.**
- NetSuite is **read-only**. There is no mutation method anywhere; a guard test rejects any
  method on the adapter whose name isn't `get*`.
- Accounting logic never lives in React components, prompts, MCP adapters, or exports.

### Product boundaries

1. Financial Life of the Unit is the flagship; missing events stay visibly missing.
2. NetSuite says / Physical evidence says / Accounting evidence says — shown separately.
3. Cycle-count history is a **management risk lens**, never auditor sampling or reliance.
4. Transaction-chain completeness is **component coverage**, never an AI confidence score.
5. Gaurd proposes and explains; it never posts.
6. Native NetSuite match state stays distinct from close-control state.

---

## 4. Repo map

```
CANONICAL_SPEC.md  README.md  CHANGELOG.md  SPEC_MANIFEST.json                 <- spec package,
docs/  prompts/  golden/  data/README.md                                          keep pristine
                                              (all 44 files are manifest-hashed; see traps in §7)
design/00_master … 06_audit-ai/    <- approved design exports (self-extracting bundles)
design/07_final/                   <- ICG-Design-Handoff.html (design 07 output, authoritative)
design/IMPLEMENTATION_HANDOFF.md   <- markdown distillation of it; what code 05-08 read
apps/web/                          <- Next.js App Router. 20 routes: /, /inventory,
                                      /inventory/[serial], /procurement, /costing,
                                      /physical-count, /cutoff, /ownership, /custody,
                                      /valuation, /exceptions, /exceptions/[id], /evidence,
                                      /reconciliation, /adjustments, /audit-package,
                                      /methodology, /close-memo, /user-guide, and
                                      /api/export/[table] (fourteen tables). There is no
                                      catch-all and no not-designed screen; every nav href
                                      resolves to a real page and shell.test.tsx walks the
                                      directory to prove it. Page data in lib/server/*-view.ts.
test/                              <- repo-wide QA scans (stage 09): stale references,
                                      synthetic-data and secret scans. Own tsconfig.
QA_RELEASE_GATE.md                 <- the docs/14 matrix with evidence per category
packages/
  domain/       types, enums, Zod schemas, money/dates, repositories   (zero deps but zod)
  data/         deterministic generator, committed fixtures, toCloseInput,
                read-only NetSuiteAdapter, demo users
  rules/        21 rules, registry, scenario replay, reconciliation, readiness, runClose
  evidence/     evidence graph, sha-256 lineage, exception→source traversal
  permissions/  explicit role matrix, authorize(), SOD, restricted-content gate
  workflows/    period + review state machines with append-only history
  audit/        append-only audit log (no mutation API)
  services/     workspace, query services, command services, demo reset,
                the single restricted-content redactor, PBC version model,
                close integrity (replay check, control totals, dependency map)
  ai/           Ask Gaurd: approved tools, deterministic answer engine, guardrails
  mcp/          stub (P2 — deliberately inert)
```

Key files a new session will want first: `packages/rules/src/close.ts` (the orchestrator),
`packages/rules/src/policy.ts` (readiness tiers + PBC baseline), `packages/services/src/queries.ts`,
`packages/data/src/allocation.ts` (frozen), `golden/baseline.json`.

---

## 5. Authored decisions (not in the spec — don't re-litigate or accidentally revert)

**From the completion pass (A/B/W), all pinned by tests:**

- **Evidence lenses are domain-aware.** The three-layer reality (NetSuite / physical /
  accounting) is the CUTOFF and OWNERSHIP pattern and EXC-001 keeps it verbatim, weighted
  middle column and all. Count, valuation and GL exceptions get their own lenses, and a lens
  with nothing behind it is **omitted** rather than filled — "No operational evidence in scope"
  was a statement about the template, not about the evidence. See
  `apps/web/lib/server/exception-lenses.ts`.
- **Control state is three separate facts**, not one word: control evaluation, accounting
  evidence, management conclusion. This is a **display mapping only** — the canonical
  `RULE_RESULTS` / `RULE_COVERAGES` vocabulary is hashed into the run and still renders as
  Rule result / Input coverage. Never rename the enums.
- **The conclusion vocabulary is separate from `ExceptionStatus`** and lives in working state.
- **Sign-off reads live state**; the Overview says so and quotes the baseline it moved from
  (`gate.divergence`). A figure that moved is only meaningful beside the one it moved from.
- **Chart of accounts is a code constant** in `packages/domain/src/accounts.ts`, never a
  fixture — a fixture would move the dataset manifest hash for a display label.
- **Physical custody is derived**, not stored: `custodyTypeFor(location, classification,
  custodian?)` in `packages/domain/src/custody.ts`. `CONSIGNMENT_IN`/`OUT` are representable
  and deliberately never occur until Stage E authors the population.
- **Inventory age matches the valuation aging exactly** (same basis, same buckets) so two
  screens cannot disagree about a unit.
- **An exception "names" a unit vs "reaches its population"** — a finding carrying only SKU
  and location tags a population, and the row says so rather than claiming the unit is under
  exception. `transactionNumbers` in a finding's subjects excludes it from population matching
  (RMA-DUP-001 would otherwise invent a 100+ unit population).
- **The guide route stays `/user-guide`** though the page and nav read "How to Explore This
  Demo" — it is the one address that may have been shared or recorded.
- **Every authored accounting judgement lives in `INVENTORY_ACCOUNTING_MATRIX`** and the
  Methodology register is a PROJECTION of it, selected by each dimension's `provenance`. The GL
  mapping is absent from the register because the specification decides it, not because someone
  remembered to omit it. Prose restating a judgement anywhere else is a second copy of it.
- **There is no assumptions surface and there should not be one** (D12, superseded 2026-08-11 by
  the owner). `/assumptions` never had content; the judgements the product makes are derivation
  provenance and belong on `/methodology`'s **Judgements** tab, beside the figures they move. An
  assumption a reader cannot find next to the number it changes is one nobody can check. The
  first draft of that page carried an "Assumptions" tab and a panel of `docs/04` principles —
  the dead page's framing outliving its content — and both were removed.
- **The close memo is management's prose and the close's figures, never the reverse.** The editor
  holds a title and a body; every figure is read from `memoPosition` on each render. Issuing seals
  two hashes — the text, and the close position it was written against — which is what makes a
  later divergence visible rather than silent. **D8: never PBC #22**, never in `CloseRunResult`,
  excluded from replay. Drafting (`memo.draft`) and issuing (`memo.issue`) are separate
  permissions: a preparer may write the memo and may not put management's name to it.
- **`WORKING_STATE_COLLECTIONS` is the one enumeration of what people did**, as opposed to what
  the rules derived. Reset Demo clears from it, reports from it, audits from it, and
  `REPLAY_EXCLUSIONS` names from it. Four hand-written copies of the same seven names had already
  drifted — the exclusion sentence listed four while the workspace held six. Do not re-expand it
  into per-collection prose anywhere; the list carries both singular and plural because these
  counts are read by a person.
- **`explainReadiness` and `computeReadiness` share one derivation** (`deriveScores` in
  `packages/rules/src/readiness.ts`). `ReadinessOut` is hashed into `outputHash` and could not
  gain a field, so the explanation is a second projection rather than a second implementation. Do
  not "simplify" it into a standalone function — that is how an explanation starts describing a
  rule the close did not run.

The spec deferred these; they were authored during the build and are now pinned by tests.

1. **Allocation plan** (`packages/data/src/allocation.ts`) — a solver-derived SKU × (location,
   classification) matrix that satisfies all 33 spec marginals exactly. **Never hand-edit.**
2. **Scenario events** — `SCENARIO-EVENTS-v1.1.0` was an ID with no content; it is now 10 ordered
   events resolving exactly the eight historical exceptions. Events reference source facts only,
   never EXC ids. The engine structurally cannot resolve the seven blockers (regression-tested).
3. **Readiness derivation** — the canonical 90/90/80/85/80/85/53.33/66.67 scores are **derived**
   from close state via tier rules in `CLOSE-POLICY-v1.0.0`, not hard-coded; total uses integer
   half-up rounding (8141.65 → 8142).
4. **PBC baseline — NOT authored; specified.** Stage 03 believed the spec deferred which four
   items are not ready and picked PBC-011/012/018/020. It does not: `prompts/code/07`
   ("Required baseline remaining items"), `prompts/design/06` ("Requires Attention") and the
   approved export `design/06_audit-ai/ICG-Audit-Package.html` all name **PBC-002 Preparing,
   PBC-005 Preparing, PBC-008 Follow-Up Requested, PBC-018 Not Started**. Stage 07 corrected
   `PBC_BASELINE_V1` to those. The status *mix* was identical either way, so 17/21 = 8095 bps
   never moved — which is exactly why nothing caught it for four stages. **Do not "restore" the
   old four.** The Provided five (PBC-001/003/004/006/007) and the per-item owner role are
   still authored; the four attention items are not.
5. **Serialized vs batch** — `KE-*` SKUs are serialized; accessories are quantity-tracked with
   `-U####` ids and report `buySideTracking: "BATCH"` rather than false "missing" documents.
6. **GL difference is seeded as three GL-entry facts** (JE-2026-0790 +2,900, JE-2026-0847 +18,750
   unsupported, JE-2027-0012 +9,200 January posting) so rules derive the reconciliation.
7. **Auditor scoping** — the auditor sees only evidence under workpapers that have been
   **provided**, and management indicators are never auditor-facing. Stage 07 made "provided"
   mean *has a sealed provided version* rather than *status reads PROVIDED*, so
   FOLLOW_UP_REQUESTED counts (support was provided and more was then asked for); stage 08 also
   withholds unsealed internal drafts from them. Scope is not the sensitivity gate: restricted
   content stays withheld inside an in-scope lineage.
8. **Not yet typed:** docs/06 objects for later stages (CloseTask/Readiness,
   TechnicalAccountingReview/LegalReview, …) arrive with their stages. This is deliberate
   staging, not an omission. **The AI objects are now typed** — `AiInteraction`, `AiToolCall`,
   `AiCitation` in `packages/ai/src/types.ts`, deliberately NOT in `@icg/domain` (the core's
   identity is that the close works if AI disappears, and `Draft` already exists in
   `@icg/services`). `Session` was not built: transcripts are a stated non-goal
   (`design/IMPLEMENTATION_HANDOFF.md` §10). **Contract and Shipment are
   already typed** — `contractFixtureSchema` (provisions: OWNERSHIP_TRANSFER / ACCEPTANCE /
   TITLE_RETENTION / CUSTODY / LOANER_TERMS / DEMO_TERMS / RETURN_TERMS, each PRESENT or MISSING)
   and `carrierShipmentFixtureSchema` (PICKUP → DELIVERED event trail) in
   `packages/domain/src/schemas/datasetFixtures.ts`, on `CloseInput` as `contracts` and
   `carrierShipments`, read by the cutoff, ownership, commercial, and procurement rules.
   Do not re-declare them.

---

## 6. Working method

**The gate — everything must be green before committing a stage:**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- Commit after each successful stage; report files changed, tests, deviations, assumptions, next gate.
- Never silently change canonical totals. If spec and code disagree, stop and identify which is wrong.
- Regenerate fixtures with `pnpm --filter @icg/data generate` and commit them — a test asserts the
  committed fixtures reproduce byte-for-byte from the seed, and that no stale fixture files linger.
- **Adversarial fleet review after each stage** (used for 02–08): finder lenses in parallel →
  dedupe → skeptic verifiers per finding at high effort → apply confirmed fixes with regression
  tests → re-run gate → commit. **Commit the stage first** — reviews are long-running background
  work. It has confirmed real latent defects every
  single time (7 clusters in stage 03, 10 in stage 04, 9 in stage 05, 16 in stage 06, 9 in
  stage 07, **18 in stage 08**), so don't skip it.
- **Add a lens that tries to BREAK the stage, not review it.** Stage 08's red-team — told to
  execute an attack and only report ones it observed succeeding — found five guardrail bypasses
  that a code-reading lens would have called defensible.
- **Write regressions as categories, not instances.** Stage 08's review criticised the original
  suite harder than the code: "each gap is the shape of a test that asserts an instance where the
  contract states a category". The replacements iterate every exception, every serial with a
  scope difference, every shipped chip.
- **Two skeptics per finding, with different jobs** — one told to refute (and to default to
  refuted when uncertain), one told to *reproduce* the failure by running code. Confirm only when
  both fail to refute; a split is **contested**, to be adjudicated inline rather than dropped.
  Four of stage 07's five contested findings were real, including the two most consequential.
- **Spend one lens on the stage's own authored interpretations**, named explicitly, with the
  agent told its job is to find where the author was wrong. Stages 07 and 08 both cleared theirs,
  which is a result worth having before it reaches a reviewer who assumes otherwise.
- The synthesis agent only sees findings that SURVIVED, so its "coverage gaps" will list things
  other lenses checked and cleared. Read the per-lens raw output in the run's `journal.jsonl`
  before believing a gap is real.

---

## 7. Open items and traps

**Needs your attention:**

- **The Physical Count screen was designed but never exported into the repo** — design 07's screen
  inventory lists `ICG Physical Count` as *Designed*, but only `ICG-Reconciliation.html` (Part C)
  was saved. *Decided 2026-08-09: it will NOT be exported.* **Settled** — stage 06 built
  `/physical-count` from the Reconciliation + Financial Life patterns plus the `prompts/design/05`
  Parts A/B spec. Nothing further is owed here.
- ~~`/evidence`, `/assumptions` and `/user-guide` are the shell's not-designed state.~~
  **Settled.** Stage 10 built `/user-guide`; Stage A built the Evidence Center, deleted
  `/assumptions` from the rail, and deleted the `[section]` catch-all and `NotDesignedScreen`
  altogether. `shell.test.tsx` now walks the app directory asserting every nav href resolves to a
  real `page.tsx`, and asserts neither the catch-all nor the placeholder component exists. There
  is no not-designed state left to land on. `/assumptions` is superseded, not owed — see §5.
- Valuation (EXC-011 reserve) and Adjustments were **deliberately not designed**; stage 07 built
  them on the exception-detail and bridge-row patterns as `design/IMPLEMENTATION_HANDOFF.md` §9
  directed. **Settled** — nothing further is owed here.
- **Fleet-review agents can leave artifacts despite read-only instructions.** The stage-07
  review left an empty `x.html` in the repo root (a stray shell redirect). Check
  `git status --porcelain` after a review and before staging; never `git add -A`. Spelling the
  ban out — no writes anywhere, no `>` / `>>` / `tee`, use inline `node -e` printing to stdout —
  worked: stage 08's 65 agents left nothing.
- **A third §9a-class mockup copy defect** was found in `05_counts-reconciliation`: the Financial
  tab asserts "Two of the three are still open items" and "Not reachable — 2 items open", but its
  own bridge rows show one open item (EXC-015; EXC-009 and EXC-014 are both resolved). The
  implementation counts it from close state instead. Do not replicate the mockup's number.
- `design/05_counts-reconciliation/ICG-Reconciliation.html` was **accidentally swept into commit
  `e0a603b`** by a `git add -A` during Stage 04 remediation; that commit message doesn't mention it.
  Harmless to the tree, but the history is misleading if that matters to you.

**Traps found during the completion pass (A/B/W) — these cost real time:**

- **`WORKSPACE_SHAPE` in `apps/web/lib/server/workspace.ts` must be bumped whenever the
  `Workspace` interface gains a field OR the dataset version moves.** The dev server caches
  the workspace on `globalThis` across module reloads, so a workspace built before the change
  survives: the first read of a new field throws, and a stale dataset quietly serves a screen
  figures its own fixtures no longer contain (Stage C's price-variance tab would have rendered
  an empty population against a v1.1.0 cache). **Tests cannot catch either** — they build a
  fresh workspace per test. Both were found only by opening the page in a browser.
- **The generator hands ONE `lines` array to the purchase order, the item receipt and the
  vendor bill** (`costLines` in `packages/data/src/netsuite.ts`). Anything that reprices or
  edits a bill line must build a NEW array — mutating in place silently rewrites all three
  documents, and a three-way match whose legs all moved together looks matched while being
  wrong. Stage C's seeded PPV depends on this; `stageC-fixtures.test.ts` pins it.
- **New serials must be minted LAST in `buildDataset`.** `SerialRegistry.mint` advances a
  per-SKU PRNG stream, so minting anywhere before the existing calls renumbers every unit
  generated after it and rewrites half the fixtures. `lifecycle.ts` runs after every other
  builder for exactly this reason.
- **Three test files mock `../app/actions` with a factory** (`ask-gaurd.test.tsx`,
  `stage09.test.tsx`, `close-loop.test.tsx`). A component that imports a NEW action from that
  module fails in those files with "No export is defined on the mock" until the factory lists
  it. Budget for this whenever you add a server action.
- **`.click()` on a DOM node does not flush React state** in jsdom. Use
  `userEvent.setup()` + `await user.click(...)`, or the panel you are asserting on never opens.
- **No irregular whitespace in source.** A literal BOM (`﻿`) inside a template literal
  fails `next build`'s lint even though tests pass. Write it as the escape. Note the shell
  collapses backslashes: build it with `String.fromCharCode(92) + "uFEFF"` if scripting the edit.
- **`computeReadiness` takes a 4th `policy` argument.** Pass `POLICY_V1` — the same policy the
  baseline scored against. A second policy would be a second definition of readiness.
- **A conclusion must never be written into `ws.close`.** It lives in `ws.conclusions` and is
  layered by `packages/services/src/effective.ts`, which has no write path. That is what makes
  Reset Demo's restoration structural rather than a discipline. Do not "simplify" it by mutating
  the derived close.
- **Evidence satisfies only the requirement it NAMES** (`satisfiesRequirement`, exact match), and
  `RETURNED` evidence stops satisfying. Do not match on kind or title — an upload must never
  satisfy a control by resembling it.
- **`ExceptionStatus` is locked spec vocabulary** (CANONICAL_SPEC §9) and is hashed into the run.
  The conclusion vocabulary is deliberately separate. Do not add values to the enum.
- **The classification→GL map is now in ONE place** — `glAccountForClassification` in
  `packages/domain/src/accountingMatrix.ts`, which is also where `COST_COMPONENT_BEHAVIOR` and
  `CUSTODY_HOLDER` live (Stage F collapsed all three). It is total over the classification enum,
  so callers need no fallback; a `?? "1200"` beside it is dead code that hides a missing row.
  **A new authored accounting judgement belongs there**, and the Methodology register picks it up
  automatically — anything held elsewhere has to be added to `buildInterpretations` by hand and
  will otherwise be a judgement the product makes and does not disclose.
- **Export handlers may import `QueryService` only** — never `@icg/data` or `ws.dataset`. That
  single rule is what gives a CSV the same role scoping and redaction the screens have.

**Traps that will bite a fresh session:**

- Design exports are ~580KB **self-extracting bundles**: the real page HTML is a JSON string literal
  on one long line starting with `"<!DOCTYPE`. Split on newlines, find it, `JSON.parse` it.
  Design tokens: parchment `--bg:#EDE3CD --panel:#F7F0DE --ink:#0E1116`, accents `--ember:#C25431
  --aurora:#2A8E6D --frost:#4A779E --warn:#8A6320`, dark rail `#0E1116`; fonts Fraunces (display),
  Geist (UI), Geist Mono (serials/money).
- `git add -A` sweeps user-created files. Stage what you changed.
- `exactOptionalPropertyTypes` is on: Zod-inferred optionals are `T | undefined`, so domain
  interfaces that receive fixture data must declare `?: T | undefined`.
- ESLint dependency rules are scoped to `packages/*/src/**` — tests may import `@icg/data`.
- **UI tests need a per-file environment docblock.** Stage 05 installed jsdom +
  `@testing-library/*` + the React plugin, but `vitest.config.ts` keeps `environment: "node"` as
  the default so the packages stay in node. Every browser test must open with
  `// @vitest-environment jsdom` on line 1 — without it, a `.tsx` test fails on `document` being
  undefined rather than telling you the environment is wrong. A `.test.ts(x)` file placed outside
  a `test/` directory still matches no glob and is ignored without warning.
- **The web app must reach data only through `@icg/services`.** `apps/web` deliberately does not
  depend on `@icg/permissions`, so `attempt()` in `lib/server/data.ts` discriminates an
  authorization denial by `error.name === "AuthorizationError"` rather than `instanceof`. Any
  other throw is rethrown on purpose — a bug must not render as a permissions boundary.
- **`SPEC_MANIFEST.json` is not enforced by anything.** No test, script, or gate step checks it —
  typecheck/lint/test/build all stay green with a stale manifest. It covers 44 files:
  `CANONICAL_SPEC.md`, `CHANGELOG.md`, root `README.md`, `data/README.md`, and everything under
  `docs/`, `prompts/`, `golden/`. If you touch any of them you must recompute that entry's
  `sha256` and `bytes` by hand (commit `cfbd22d` did exactly that). Note **stage 10 explicitly
  asks you to update root `README.md`, which is manifest-covered.** To verify:
  `$m = Get-Content SPEC_MANIFEST.json -Raw | ConvertFrom-Json; foreach ($f in $m.files) { if ((Get-FileHash $f.path -Algorithm SHA256).Hash.ToLower() -ne $f.sha256) { $f.path } }`
- Subagent fleets can hit session usage limits; if verifiers die, their findings are **unverified,
  not refuted** — adjudicate them inline rather than trusting the tally.
- Old session workflow journals (with full finding lists) live under
  `C:\Users\dough\.claude\projects\C--dev-Inventory-Close\<sessionId>\subagents\workflows\*\journal.jsonl`.
  A journal only gains a `{"type":"result"}` line when an agent **finishes**: a run whose host
  process died mid-flight leaves nothing but `started` lines and is not recoverable — relaunch it.
- **Commit the stage before the fleet review, not after** (as stages 03/04 did with their own
  remediation commits). Reviews are long-running background work; three host exits during stage
  06 would each have stranded an uncommitted tree.
- `pnpm test` can OOM ("Zone Allocation failed") when a `pnpm dev` server is also running — the
  jsdom suites plus a Next dev server exceed available RAM. Stop the dev server first. A second
  symptom of the same pressure is esbuild dying with "The service is no longer running" or
  "runtime: cannot allocate memory", which fails **every** file with *no tests run* — that is an
  environment problem, never a code regression.
- **`vitest.config.ts` sets a 30s `testTimeout` deliberately.** The first test in each file pays
  for the whole deterministic close (buildDataset over 1,500 units, runClose across 21 rules,
  then the evidence graph). Under the 5s default that sat right on the boundary: the first test
  in a jsdom file failed on a loaded machine and passed on an idle one, which reads as a
  regression and is not one. Don't lower it.
- **Never rewrite a source file with PowerShell `Get-Content -Raw` + `Set-Content`.** PS 5.1
  reads as ANSI, so every em dash, `·`, `§` and status glyph comes back as mojibake; it type-
  checks and lints clean and only shows up as garbage in the rendered UI. Use the Edit tool.
  To check: `Get-ChildItem -Recurse -Include *.ts,*.tsx,*.css apps,packages | ForEach-Object
  { if ([IO.File]::ReadAllText($_.FullName) -match '[âÃÂ]') { $_.FullName } }`.
- **`perl -0pi -e 's/…/…/'` is the same hazard with a different signature.** Used on
  `answers.ts` to mutate one line for a mutation test, it did not perform the substitution and
  instead wrote **NUL bytes over two spaces** — both inside `` `${sku} ${location}` ``, the
  template literal the pattern was reaching into. `-0` sets the record separator to NUL and the
  pattern's `${…}` interacts with Perl's own interpolation; the result compiled, and `grep`
  reporting `Binary file … matches` was the only symptom. **Use the Edit tool for in-place edits,
  including throwaway mutation tests.** To check a working tree:
  `node -e "const fs=require('fs'),cp=require('child_process');for(const f of cp.execSync('git diff --name-only',{encoding:'utf8'}).trim().split('\n')){const b=fs.readFileSync(f);if(b.indexOf(0)>=0)console.log('NUL',f)}"`

---

## 8. What to do next

> **Superseded for the active work — see §0a.** The next task is **reviewing Stage G**;
> Stages A–F of the product-completion pass are done and committed, Stage F is reviewed, and its
> remediation is reviewed. The rest of this section records the original ten-stage release, which
> is finished and deployed.
>
> **Before starting:** run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (expect
> **1,010 tests across 69 files**; `pnpm test` may exit 1 on a reporter timeout — read the
> `Tests` line, not the exit code), and **stop any `pnpm dev` server first**.
>
> **A push to `master` redeploys the live site, and the whole completion pass — Stages A through
> F and both review remediations — has NOT been pushed or deployed.** Everything since `9b07e96`
> is local. Do not push without the owner asking for it.

**Both final data passes are complete** — full records, fix lists, refuted-finding
register and the owner-decision register live in `QA_RELEASE_GATE.md` ("Final data
passes"). What remains from the original release, in order:

1. **Published and deployed — nothing owed here.** The repo is public at
   **https://github.com/dogsleddev/inventory-close** and the site is live at
   **https://inventory.dogsled.dev**.

   Vercel setup (project `inventory-close`, team `dogsled`,
   `prj_2gyivdsxKa4rvyFXmbkaoXiUwO1j`): **Root Directory = `apps/web`**, framework
   `nextjs`, build/install commands left null so Vercel's pnpm-workspace defaults run.
   Git is connected to `dogsleddev/inventory-close` with production branch `master`, so
   **a push to `master` redeploys**. No environment variables exist; the security headers
   come from `apps/web/vercel.json` (verified live: HSTS, `X-Frame-Options: DENY`,
   `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
   *Trap:* deploying with the CLI **from `apps/web` fails** — it uploads only that folder
   and `npm install` chokes on the `workspace:*` deps. Deploy from the git source (a push,
   or the dashboard), which builds the whole workspace with Root Directory applied.
   All 13 routes verified 200 and the Overview renders the canonical figures.

   *Repo note:* the owner's Prompt Driven Development GitHub App auto-plants
   `.github/workflows/pdd-secrets-dispatch.yml` into new repos on this account. It is a
   vendor tool the owner uses deliberately, but it is **deliberately kept out of this
   project** — it arrived on a stray `main` branch that was deleted 2026-08-10. If it
   reappears, delete it again rather than merging it; `master` is this repo's default
   branch and must stay that way.
2. **Remaining owner decisions on the conflict register** (in `QA_RELEASE_GATE.md`;
   never resolve by silently changing a locked value): the EXC-001 count-row item is
   **settled — accepted 2026-08-10 as a documented tension, no change**. Still open,
   both P3 wording: the §1 "81.42%" Overview headline vs the one-decimal overview scale
   everywhere else, and the §5 "validated receipt timing" vs §9 "PO/receipt/GL timing"
   label. Editing `CANONICAL_SPEC.md` or any `docs/` file means recomputing its
   `SPEC_MANIFEST.json` entry by hand (§7).
3. Optional P2s, in value order: drawer dialog semantics (`aria-modal`/`inert` — conflicts
   with the pinned stage-05 `complementary` contract, needs a design decision); a
   git-history credential scan in `test/` (history was verified clean by hand, but the
   permanent scan covers only the working tree); dark-theme capsule-contrast audit
   (light was measured and fixed; dark passed spot checks).

**What the final data passes established that must not be undone (`fb496a0` + close-out):**

- **Operational events own the movement story.** An installed unit's `lastMovementAt` is
  its install day; an assigned unit's is its assignment start (`OperationalResult.unitPatches`).
  Sold serials carry full PO→IR→VB history folded into real purchase batches. Carrier
  pickups never precede book movements; pre-snapshot count-window movements must leave a
  count-variance trace. Cycle-count quantities anchor on year-end cell levels capped by
  company-wide acquired stock. All pinned by `packages/data/test/pass1-regressions.test.ts` —
  a generator change that breaks a category fails there, not in a demo.
- **Classification display names are CANONICAL_SPEC §5's own vocabulary** (`GIT` and `RMA`
  stay acronyms) via `classificationLabel()`; `apps/web/test/pass1-classification.test.ts`
  iterates every value the dataset carries.
- **The three-noun wording pact is test-held** (`pass2-wording-pact.test.ts`): the Ask
  Gaurd availability note and the User Guide share "Every figure, status and citation",
  and the four-noun attribution may not appear in any shipped surface.
- **Every highlight figure re-derives and reads identically on every surface** (pass-2
  record). If you touch a surface that states a canonical figure, the cross-surface sweep
  is the bar a re-check must clear; a mismatch between two surfaces is a finding even
  when both are individually defensible.

**What the stage-10 verification established that must not be undone (`1c85866`):**

- **Conclusions are never attributed to software.** Figures and statuses are derived;
  conclusions are recorded by people. Both the README thesis and the Ask Gaurd
  availability note carried the four-noun version ("figure, status, conclusion and
  citation"); the three-noun version is now pinned on both surfaces.
- **The read-only rule's mechanism is unqualified-selector + file-order.** An inline
  `display` defeated `.icg-action-conclude { display: none }`; the first fix recreated
  the same defeat via `div.`-qualified specificity. The regression pins the mechanism.
- **A scan that names a file must fail when the file is missing.** The credential scan's
  config roots listed `.js`/`.ts` names for `.mjs` files and covered nothing for a stage;
  `CONFIG_ROOTS` now has an existence assertion.
- **Every wide band collapses below 1024** — the `MUST_COLLAPSE` list in
  `fulltree-regressions.test.tsx` is the contract; a new multi-column band joins it. No
  inline `gridTemplateColumns` may carry ≥240px of fixed track (same test).
- **Nav labels leave the layout via the clip pattern, never `display:none`** — all 13
  links were nameless below 1280 (WCAG 4.1.2 A).
- **`--quiet` and the `*-text` accent tokens are AA-measured.** The disclaimers render in
  `--quiet`; the capsules and risk-high text use `--ember-text`/`--aurora-text`/
  `--frost-text`/`--warn-text`, computed against their own tinted chips.
- **The SYNTHETIC DEMO tag wraps, never overlaps** — it is the mandated disclosure, and
  it was illegible at 1366×768, the most common laptop width.

**What the full-tree review established that later stages must not undo (`30494c0`):**

- **An enumerated denylist is not a category.** All four confirmed Ask Gaurd defects were
  one shape: a guard listing the phrases someone thought of. "Resolved" was caught and
  "concluded/settled/finalised" were not; digits and number words were caught and *zero*
  was not; "sign off" was caught and bare "signed"/"booked" were not. When you touch
  `guardrails.ts`, add the **category** and a test that iterates it — writing those tests
  found two further holes in the first version of the fix.
- **`anyDenied` must be re-read after any probe.** It is a live getter over the tool call
  log. The engine checked it before the resolve-probe ran, so a probe that was DENIED
  looked like an object that does not exist, and the assistant told an unauthorized user
  that a real serial was not in the population. Stage 08 fixed exactly this substitution
  for the intent-tool path; the scope-probe path kept it. **A refusal must still name
  which kind of nothing it is.**
- **Identified ≠ drafted ≠ posted.** The register's three counts are different numbers
  and "proposed" is this product's word for a *drafted* entry. Rendering the identified
  count as "3 proposed" claimed an entry that was never written. Any surface quoting an
  adjustment count reads `getAdjustmentRegister()` and names which count it is showing.
- **A test that pins a literal keeps a defect green.** `overview.test.tsx` asserted the
  string "3 proposed, none posted" and so protected the overstatement for four stages.
  Assert against the service that produced the number.
- **A guarded assertion is not an assertion.** `if (x !== undefined) expect(...)` passes
  silently exactly when the thing it checks stops being produced.
- **Run identity binds every controlled input `docs/16` names** — dataset, ruleset, rule
  versions, policy, config, scenario script — plus the input's row shape, because
  `datasetHash` is a claim the caller supplies rather than a measurement of the input it
  was handed. Two materially different runs must never share one run id.
- **The replay hash and the mismatch diagnostic read ONE projection**
  (`comparableSections` in `close.ts`). They drifted before: `ruleResults` decided the
  verdict but sat outside the compared list, so a coverage-only difference could report
  MISMATCH and name nothing.
- **A synthesis agent's "coverage gaps" are not gaps.** It only sees findings that
  survived verification, so it reported the redactor, the locked aggregates, permissions,
  the read-only boundary and evidence lineage as unexamined. Eight lenses examined those
  areas at high effort and cleared them. Read the per-lens results in the run's
  `journal.jsonl` before chasing a gap.

**What stage 09 established that later stages must not undo:**

- **A replay proves the numbers come from their sources.** `verifyReproduction()` rebuilds the
  dataset from the seed and re-runs the rules; it never compares the workspace to a stored copy
  of itself. What it compares is `REPLAY_COMPARED_SECTIONS`, exported from `@icg/rules` so a
  surface reporting coverage reads the same list the comparison used. The exclusions —
  narration, working state, the audit trail — are data (`REPLAY_EXCLUSIONS`) and are printed
  next to every result. An equivalence check that hides its exclusions reads as a stronger
  claim than it is.
- **A control is gated on the permission the command authorizes against, never on a role list.**
  `DEMO_RESET_PERMISSION` is declared once in `commands.ts`; `getDemoCapabilities()` and
  `resetDemo()` both use it, and a test walks every demo user asserting offer and allow agree.
- **`resetDemo()` reports what it cleared and what survived.** A reset that silently kept or
  dropped working state is indistinguishable from one that did the opposite. The audit log is
  append-only and keeps every event including the reset itself.
- **Book units and the count population are different figures.** 1,500 on the book, 1,065 in
  countable locations. The manifest labels them separately; the first version of that panel
  called the count population "Book units", which is the same class of defect as any other
  sentence asserting more than its source.
- **A filtered list says what it filtered on.** `/cutoff` and `/ownership` read control domains
  from the rule registry (`listRuleSummaries()`), state the domains they include, and say their
  counts are the filter's rather than the close's. Ownership groups OWNERSHIP with THIRD_PARTY —
  an authored grouping, which is why the page names both.
- **The AI-off condition is stated on the answer.** `describeAvailability()` in `@icg/ai` reports
  whether a provider contributed; the drawer renders "AI OFF — DETERMINISTIC ANSWER" with the
  reason. No provider is bound anywhere, so this is the running mode, not a fallback.
- **`test/` scans the tree, not the application.** Every serial, exception, workpaper, rule and
  source-system id in shipped source must exist in the built dataset — checked against live
  data, never an allowlist. A new identifier pattern belongs in that scan. `pnpm typecheck`
  covers this directory through `test/tsconfig.json` (Bundler resolution; the packages stay on
  NodeNext).
- **The root `package.json` now depends on `@icg/{data,domain,rules}`** so the repo-level scans
  can build the dataset. Keep them as devDependencies.

**What stage 08 established that later stages must not undo:**

- **There is ONE restricted-content redactor**, `packages/services/src/redaction.ts`. An evidence
  item carries the retrieved value twice (`content` and `originalValue`) and the fixture pipeline
  is an identity transformation, so clearing one and spreading the other discloses everything.
  That bug shipped in stage 04, was fixed in `traceLineage` in stage 08, and then turned out to
  exist in a **second copy** in `commands.ts`. If a third copy of the value is ever added to an
  evidence shape, `redactRestricted()` is the one place that learns about it.
- **Ask Gaurd's answer is deterministic; only `narration` is generative.** Every figure, status
  and citation is read from a tool result (the management-conclusion sentence is authored prose
  in `answers.ts`, deliberately never attributed to a tool — conclusions are recorded by people),
  so "numeric values must match tool results exactly" holds by construction. There is no provider
  bound anywhere — the engine IS the answer, which is why the "disable the AI provider"
  acceptance test is the normal case here. The three-noun wording pact between the availability
  note and the User Guide is pinned by `apps/web/test/pass2-wording-pact.test.ts`.
- **Narration may not carry figures or identifiers at all.** Five separate bypasses came from
  trying to decide whether a number in prose was the RIGHT number. That comparison is not
  reliably decidable across spellings, scripts and phrasings, so it is not attempted: quantities
  and record ids belong to the structured answer. Do not "improve" this by re-admitting numbers.
- **Every tool takes the caller's `ServiceContext`.** Authorization, restricted-content
  redaction and auditor scoping are inherited from `@icg/services`; a tool that builds its own
  context or reads the workspace directly bypasses all three silently.
- **A refusal must name which kind of nothing it is.** NOT_AUTHORIZED / NO_SUCH_OBJECT /
  OUT_OF_SCOPE are three different states, and NO_SUCH_OBJECT is a claim about the world — it
  must be established by asking the tools, never inferred from the shape of the request.
- **A timeline must read `ref` and `at` from the same scope.** Crossing a scoped and an unscoped
  source turned a withheld date into an absent one and let the sort reorder a chain of custody.
  Withheld is its own state and is held out of the ordering.
- **Ask Gaurd's suggestion chips and the intent table must stay reconciled** — a test asserts
  every shipped chip produces an answer. They were authored independently and 18 of 32 refused.
- AI types live in `@icg/ai`, not `@icg/domain`: the core's identity is that the close works if
  AI disappears. No AI permission key (each tool authorizes through its query) and no audit event
  per question (docs/09 scopes logging to *saved material work*). All three survived a hostile
  interpretation audit.

**What the stage-07 fleet review established (`36dafe5`) — 5 confirmed, 5 contested, 4 refuted:**

- **Gate a sentence on the fact it names, never on a proxy for it.** Every confirmed defect was
  this: an empty evidence list standing in for "not provided" (which told the auditor four
  sealed, provided workpapers had never been provided), a location standing in for "assessment
  outstanding", `recon.items` standing in for "drafted proposals". In each case the correct
  predicate was already in hand and discarded.
- **ScopeNotice is a property of every section a scope predicate can empty**, not of the
  sections that happen to have tests. The Evidence tab disclosed suppression; the Workpaper
  tab, twelve lines above it in the same builder, did not.
- **An auditor sees sealed versions only.** `getPbcPackage` filters unsealed drafts for them and
  reports `withheldVersionCount` so the omission is visible. `hasProvidedVersion`,
  `latestVersion` and `immutable` are still derived from the full history.
- **Row activation is structural and jsdom cannot see it.** `.icg-row-btn::after` is
  `position:absolute; inset:0` and must resolve against `.icg-table tr`, so the ID cell must
  **not** be positioned and the anchor needs `icg-row-link` to sit above the overlay. A new
  table that drops either one silently loses the row hit area, the ID link, or both.
  `apps/web/test/stage07-regressions.test.tsx` pins the pairing across every row-activated
  screen, and the §5 test pins that any 4+ column KPI grid has a 1280–1439 rule.
- **Accepted as refuted:** sealing version hashes against `currentStateHash` rather than
  `preparedStateHash`. The two are provably equal in every reachable state — `ws.close` is
  assigned only inside `resetWorkspace`, which re-derives the prepared map from the same object
  — and sealing against the prepared hash would be worse in the only state where they differ.
- The lens tasked with attacking the three stage-07 interpretations (the PBC baseline
  correction, the sealed-version scope model, and shipping two drafted entries against
  "JE-001/002/003") **produced no finding against any of them**.

**What stage 07 established that later stages must not undo:**

- **Provided is a sealed version, not a status word.** `packages/services/src/pbc.ts` derives
  each workpaper's history; a version with a `contentHash` is immutable and is superseded rather
  than edited, and exactly one object in a history is `editable`. The hashes are derived from
  the workpaper identity plus its dependency-state hash, so they reproduce exactly.
- **Auditor scope keys on `hasProvidedVersion`, not on `status === "PROVIDED"`.**
  FOLLOW_UP_REQUESTED means support was provided and more was then asked for, so its sealed
  versions are in the auditor's hands. At the corrected baseline that puts **EXC-001 in scope**
  (via PBC-008) and **EXC-009 out of it** (PBC-002 has never been provided) — the reverse of
  stages 04–06. Scope is not a content gate: restricted contract content is still withheld
  inside an in-scope lineage, and `makeRecordScope()` still governs raw-fixture projections.
- **The adjustment register is keyed on reconciling items, not on proposals.** Three identified,
  two drafted, zero posted. Never create a third proposal to make the register look complete:
  `proposedAdjustments.length / reconciliation.items.length` **is** the ADJUSTMENTS readiness
  score (2/3 = 6667), so a third would move 8142 bps. An item with no entry states why.
- **`posted` is structurally `false`** on `ProposedAdjustmentOut`, `postedCount` is typed `0`,
  and no command service method writes anywhere. A stage-07 test asserts no command name matches
  /post|writeToNetsuite|approveAdjustment/.
- **No reserve amount exists anywhere.** `buildValuation()` reports the recorded 1290 balance and
  the conclusion `UNDETERMINED`; there is no field, query, or control that carries a proposed
  reserve, and Ask Gaurd must not add one.
- **A valuation review's population is the aged subset**, not every unit of the SKU. EXC-011 is
  20 aged KE-M1 units, not 292 KE-M1 units — the first version of this screen got that wrong.
- **`@icg/services` re-exports the rule result shapes** the web app types against, so
  `apps/web` never imports `@icg/rules` directly and the UI → services → rules direction holds.
- The bridge's Financial tab is the **default** Reconciliation tab; stage-06 tests that assumed
  Procurement Match now click through to it.

**What stage 06 established that later stages must not undo:**

- Page data lives in `apps/web/lib/server/` — `financial-life-view.ts`, `count-view.ts`,
  `recon-view.ts` alongside `data.ts`/`exception-view.ts`; components receive JSON-safe view
  models from `lib/view-model.ts` and carry no accounting logic.
- Four routes exist: `/inventory` (serial search), `/inventory/[serial]` (Financial Life),
  `/physical-count`, `/reconciliation`. `app/[section]/page.tsx` still covers the rest.
- **Native NetSuite match state vs close-control state**: muted mono `.icg-nstag` beside the
  coloured close capsule, never derived from one another. `getProcurementMatches()` supplies both.
- **Chain completeness is component counts**, never a score, ratio bar, or percentage.
- **Cycle-count history is a management risk lens.** `getCountDetail()` returns no
  `managementIndicators` for an auditor, and the UI renders `ScopeNotice` in that slot while
  keeping the factual history visible. No sampling language, no sample-generation control.
- The **§9a-2 carrier defect is corrected at the source**: carrier state comes from the
  service's real delivery event (`shipmentPosition` in `financial-life-view.ts` mirrors
  `carrierEvent` in `exception-view.ts`). Never re-introduce static "in transit" copy.
- Additive read-only service queries stage 07+ can rely on: `FinancialLifeView.records` and
  `.recordTotals`, `getProcurementDetail()` (documents **and** their totals),
  `getCountDetail().adjustments`, and `listLocations()`.
- **Document totals are summed in the service, never in the web layer** — `recordTotals` and
  `ProcurementDetail.totals`. An absent total renders as absent; the UI formats money and
  never adds it up.
- **Source documents inherit the visibility of the evidence they are.** `makeRecordScope()` in
  `queries.ts` withholds a record whose evidence-graph counterpart is outside the viewer's
  scope, so the record projections cannot become a side door around `listEvidence` /
  `traceLineage`. Any future raw-fixture projection must go through it.
- **Location display names come from `listLocations()`**, registered once into
  `humanize.ts`. Never transcribe a location name into the UI — the dataset owns them
  (`STAGING` is "Shipping / Install Staging", not "Staging").
- Count truth helpers live in `financial-life-view.ts`: `countOutcome()` /
  `countOutcomeDetail()` read **every** year-end row for a serial. A count that failed to find
  a unit is evidence of absence, and one clean row is not a clean count — a serial can have
  two (EXC-013). Never re-introduce a `.find()` over year-end rows.

**What stage 05 established that later stages must not undo:**

- `design/IMPLEMENTATION_HANDOFF.md` is the build contract; §4 interaction, §5 responsive, §6
  semantic distinctions and §7 accessibility are requirements, and stage 05's fleet review found
  real defects in all four. Row activation: the row is the hit area and opens a drawer, the **ID
  cell** navigates (`.icg-row-btn` + `.icg-row-id`). Audit Details is collapsed by default and its
  state is not remembered between objects (key the drawer per record). Drawers use
  `lib/use-drawer-focus.ts` for focus-to-heading, tab trap and focus restore.
- Workspace two-column splits use `.icg-split` and set only `--icg-split-cols` inline, so the
  breakpoints can still collapse them. Never write `grid-template-columns` inline on a split.
- The theme contract lives in `lib/theme.ts` (`THEME_KEY`, `THEME_ATTR`, `THEME_BOOTSTRAP`).
  Both the `<head>` bootstrap and the toggle read it from there.
- **Copy may never assert more than the services returned.** A missing required record renders as
  a gap, never a positive state; a gap with no record behind it names no source system; a section
  emptied by the viewer's scope says so via `ScopeNotice` instead of rendering empty. The
  regressions live in `apps/web/test/evidence-truthfulness.test.tsx` and
  `apps/web/test/interaction-contract.test.tsx`.
- `apps/web/test/no-hardcoded-totals.test.ts` is the locked-baseline firewall over `app/`,
  `components/` and `lib/`. Add any new canonical figure you render to its `FORBIDDEN` list.

The 60-second demo path the UI must serve:
`Overview → EXC-001 → NetSuite vs Physical vs Accounting → Transaction Chain → Ask Gaurd`.
