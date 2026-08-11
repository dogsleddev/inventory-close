# Inventory Close Gaurd — Product Completion Plan

**Status:** authored 2026-08-10, before any code change. Supersedes nothing; it *sequences* the
existing locked artifacts (`CANONICAL_SPEC.md`, `docs/`, `design/IMPLEMENTATION_HANDOFF.md`) against
the owner's product-completion brief and an independent site critique.

**Positioning this pass is building toward:**

> Inventory Close Gaurd is the evidence and close-control layer that helps Finance determine whether
> NetSuite, physical operations, inventory costing, commercial transactions, and accounting support
> tell the same year-end story.

**Principles that govern every change below:** Evidence before inference. AI investigates,
Controllers conclude. NetSuite is read-only. Financial truth lives in structured state. Revenue
recognition is out of scope.

**Inputs.** A 15-agent critical review of the live product (6 lenses + 8 adversarial verifiers +
completeness critic; every high-severity factual claim survived refutation) and a 9-cluster
current-state audit of the codebase against the completion brief. Both are summarized here; the raw
finding sets live in the session task outputs.

---

## 1. Current-state audit

The deterministic core is in better shape than the product surface. 628 tests across 47 files are
green; every locked figure derives from `@icg/rules` through `@icg/services`, and a
`no-hardcoded-totals` firewall test mechanically forbids canonical figures appearing as literals in
`apps/web`. What is missing is almost entirely **surface area and verbs**, not accounting truth.

| Layer | State |
|---|---|
| `packages/domain`, `data`, `rules` | Strong. 15 golden scenarios, signed reconciling items, frozen allocation plan, determinism/replay tests. |
| `packages/services`, `permissions`, `evidence`, `workflows`, `audit` | Strong and **under-used**: 10 authorized commands exist, 1 is reachable from the UI. |
| `packages/ai` | Deterministic 16-tool / 12-intent pipeline with real guardrails; intent matcher is fragile (see §3.9). |
| `apps/web` | 14 routes, 2 of them admitted placeholders; read-only throughout; no export; no master population view. |

**The one-sentence finding:** the product currently *documents* a close that happened elsewhere
instead of being the place the close happens.

---

## 2. What already satisfies the brief (do not rebuild)

- **Dual-status three-way match** — native NetSuite status vs close-control status is fully modeled,
  rule-computed (`PROC-3WM-001`), service-exposed, UI-rendered and golden-locked, with **EXC-002 as
  the exact demonstration the brief asks for**. The brief's three-way-match requirement is already met;
  it needs re-hosting in a Procurement section, not building.
- **Proposed vs posted separation** — the register already renders balanced JE lines with
  `NOT POSTED` tags, a hypothetical-total label, and preparer/reviewer/approval fields.
- **Reconciliation bridge** — $12,450 fully derived; EXC-009 −$2,900 / EXC-014 +$9,200 /
  EXC-015 −$18,750 carry the locked signs and are pinned in `golden.test.ts`.
- **Valuation honesty** — `UNDETERMINED` reserve is enforced by the literal type in `ValuationOut`;
  no rule can emit a reserve amount.
- **Evidence graph, sealing, redaction, role scoping** — `listEvidence`, `getEvidenceLinks`,
  `traceLineage`, `redactRestricted`, sealed PBC versions with `withheldVersionCount`.
- **Physical count** — snapshot id, 1,061/1,065 first pass, variance rows, authorized movements,
  management vs auditor-selected test counts (keep all four tabs; two are `CANONICAL_SPEC` §6 requirements).
- **Determinism** — `Reproduce Close` (14 compared sections), `Reset Demo` re-derivation, run manifest.
- **Print stylesheet** — a deliberate `@media print` block already exists at `apps/web/app/icg.css:2620`
  and is completely unsurfaced. Cheapest export win in the repo.
- **Not a defect:** the reported `SerialSearchBar` backslash typo is stale — the file is byte-verified
  as `action="/inventory"`. Closed, no change.

---

## 3. P0 defects

Ordered by damage to the brief's own thesis.

**3.1 The controller cannot do anything.** `Record conclusion` and `Request evidence`
(`ExceptionDetailScreen.tsx:261-266`, `ExceptionDrawer.tsx:184-186`) are enabled, primary-styled
buttons with no handler. 9 of 10 commands in `packages/services/src/commands.ts` are unreachable.
No command records an exception conclusion at all. The sign-off gate is therefore permanently
unclosable — nobody can ever experience the product's central promise.

**3.2 Nothing can leave the app.** No export, download, CSV or print affordance anywhere. "Provided"
PBC versions seal a *metadata* hash with no document behind it. An audit team can retain nothing.

**3.3 Two placeholder routes in primary nav.** `/evidence` and `/assumptions` render
"not designed yet" in developer language — and *Evidence*, the product's namesake, is the empty one.

**3.4 The user guide is a manifesto.** Five panels, 5 of 13 sections documented, no glossary, no
anchored links, design-token language ("ember dash") in user-facing copy.

**3.5 Overview hierarchy is inverted and its KPIs are dead.** The 81.4% readiness dial dominates the
question that actually matters ("what prevents sign-off?"), and all six KPI tiles are static `div`s.

**3.6 Exception lenses are a fixed template.** All 15 exceptions get NetSuite/Physical/Accounting
regardless of domain: EXC-003 (a count exception) renders cutoff language *and* the forbidden
"No operational evidence in scope"; EXC-015 (a GL exception) gets a meaningless physical lens.

**3.7 Coverage language contradicts itself.** `Coverage COMPLETE` prints beside `Required evidence
missing`. Three distinct facts (control evaluation, accounting evidence, management conclusion) are
collapsed into one word.

**3.8 Ownership overstatement.** `TPI-CONF-001` generates "holds 14 company-owned units" as
established fact while rights are unconfirmed — rendered verbatim on live EXC-007.

**3.9 Ask Gaurd intent matcher mis-routes.** The counts intent's unanchored `/count/` regex captures
"GL **account** 1200" and "**account**ing impact of SO-26184" *today*; ~10 new intents cannot be added
before the matcher is anchored and a routing-identity harness exists. Separately, the drawer
advertises a `Draft` capability nothing implements, and the most natural controller question
("what should I work on first?") returns `OUT_OF_SCOPE` despite the data existing.

**3.10 Demo has no front door or exit.** One global page title for all routes, no favicon, no
Open Graph card, no maker attribution, no contact, no analytics, no `loading`/`error`/`not-found`
routes (a bad URL lands on Next's bare 404).

---

## 4. P1 enhancements

Grouped as the brief groups them, with the audit's verdict on each.

| Enhancement | Audit verdict |
|---|---|
| All-Inventory master list (1,500 rows, rich filters) | **Easiest large win.** `listInventoryUnits` already returns all rows; every column exists or is derivable. No fixture change. |
| Inventory GL account table (1200/1210/1220/1230, 1290 separate) | Derivable from `glBalances` + `CLASSIFICATION_GL`. Chart-of-accounts descriptions as a **code constant**, never a fixture. |
| Full JE detail | Needs optional `proposedAt`/`period` fields on `ProposedAdjustment` (versioned, additive). EXC-015 must stay **undrafted**. |
| Procurement section (3WM, GRNI, INR, GIT, PPV) | Best-provisioned cluster. 2 real GRNI rows and 4 INR POs already exist in fixtures. Only PPV needs authored data. |
| Costing / standard cost stack | **Entirely absent.** Needs a per-SKU component fixture whose components *sum exactly* to the locked unit costs. |
| R&D cost classification | Absent. New `periodCosts` collection that must stay **out of `glBalances`** (see §8). |
| COGS state | Nearly free — `O2C-CHAIN-001` already computes inventory-relief presence per chain. |
| Custody vs ownership (10 custody types) | 9 of 10 derivable from `(location, classification, custodian)`. Only consignment needs data. |
| Consignment-in | New off-book fixture collection; `KE-X1-8842` proves the pattern. **Informational only, no rule.** |
| E&O methodology depth | Mostly derivable; condition/recovery honestly "not on file". |
| Scrap / disposition | **Real gap.** No unit has any disposal event. Needs a new historical FY2026 serial, excluded from the 1,500 by construction. |
| Methodology & Calculations | Greenfield page; every figure must render from services (firewall test enforces it). |
| Inventory Accounting Matrix | New `packages/domain/src/accountingMatrix.ts` as the shared source `CLASSIFICATION_GL` derives from. |
| Management Close Memo | New domain type in **workspace working state** — never in `CloseRunResult`, never PBC #22. |
| Ask Gaurd tool expansion | ~10 new intents, gated on matcher hardening. |

---

## 5. Required domain / data-model changes

**Derivation-only (no fixture change, no dataset bump):**
- `PHYSICAL_CUSTODY_TYPES` + `custodyTypeFor(location, classification, custodian?)`
- `COGS_STATES` enum
- `INVENTORY_ACCOUNTING_MATRIX` (custody × ownership × GL × COGS × evidence)
- Chart-of-accounts descriptions constant
- Accounting-ownership and evidence-status rollups

**Versioned, additive, needs approval:**
- `ProposedAdjustment`: optional `proposedAt`, `period`, named preparer/reviewer
- `CloseMemo` / `MemoVersion` types + `Workspace.memoVersions`
- `ConcludedException` working-state record + `exception.conclude` permission key
- `RuleDefinition` display metadata (title, concludes / does-not-conclude) — **`Rule.version` untouched**

**New generator-produced fixture collections (all ride one dataset bump — see §9):**
- `costComponents.json` (must sum to locked unit costs)
- `periodCosts.json` (R&D and department costs; **never** in `glBalances`)
- `consignmentInUnits.json` (vendor-owned, off-book)
- disposition records + one historical scrapped serial
- optional seeded PPV price variance

---

## 6. Required service / tool changes

New read-only queries (all behind existing permissions, all consumed only through `QueryService`):
`listInventoryMaster`, `getGlAccountReconciliation`, `getCustodyBreakdown`, `getEoMethodology`,
`getCostStandards`, `getCostClassification`, `getProcurementPopulations` (GRNI/INR/GIT/PPV),
`getDispositions`, `getClosePolicy`, `getMemo`.

New commands: `concludeException`, `requestEvidence`, `saveMemoDraft`, `sealMemoVersion` — plus
server actions exposing the *existing* `submitEvidence`, `reviewEvidence`, `addComment`,
`requestReview`, `approveReview`, `lockPeriod`.

Export route handlers under `app/api/export/[table]/route.ts` (Node runtime — `packages/evidence`
uses `node:crypto`). **Hard rule:** handlers may import `QueryService` only, never `@icg/data` or
`ws.dataset`, so auditor scoping and redaction apply automatically.

Ask Gaurd: anchor the intent regexes, order specific-before-general, add a routing-identity
regression harness, then add intents for work-priority, GL-account inventory, GRNI, INR, cost stack,
scrap, JE detail, SO accounting-impact walk, consignment custody, memo drafting.

---

## 7. Required UI changes

Nav becomes a two-level model (`{label, href, children?}`) rendered as groups in `AppShell`.
**A group child is only added when its page exists** — otherwise the restructure recreates the
placeholder problem it is meant to remove.

New screens: Evidence Center, All Inventory, Procurement, Costing, Cost Classification, Scrap &
Disposition, GL Accounts, Sales/Deployment Chain, Methodology & Calculations, Close Memo,
How to Explore This Demo. Reworked: Overview hierarchy + clickable KPIs, exception lenses, coverage
labels, reconciliation four-block structure, JE detail, Valuation tabs.

Preserve the approved design language, tokens, glyph+label status discipline, drawer arbitration,
row-activation pairing, and the sub-1024 action-removal rule (`.icg-action-conclude`).

---

## 8. Golden-test impact

**Structurally safe.** Golden tests build a fresh dataset per run (`packages/rules/test/helpers.ts`)
and `createWorkspace()` per test; nothing golden reads the web singleton. Live user mutations
therefore cannot move locked figures, and `Reset Demo` restores.

**The five real traps:**

1. **`readiness.ADJUSTMENTS = draftedCount / identifiedCount`** is literally 2/3 = 6667 bps. Drafting
   a JE for EXC-015, adding a 4th reconciling item, or resolving EXC-015 flips it to 100% and breaks
   81.42%. EXC-015 stays undrafted, displaying `Offset account: Accounting Review Required`.
2. **`buildReconciliation` sums ALL `glBalances` except 1290.** Any new accrual/expense/COGS balance
   row breaks the locked $4,812,450 unless the filter becomes an explicit `{1200,1210,1220,1230}`
   allowlist (a rule change requiring re-verification). Keep new cost data out of `glBalances`.
3. **Canonical enums are hashed into `outputHash`.** `RULE_RESULTS` / `RULE_COVERAGES` /
   `EXCEPTION_STATUSES` must not be renamed or extended — the coverage-language fix is a **display
   mapping**, and a management conclusion is a **working-state record layered over** the derived status.
4. **Any fixture change regenerates the manifest** and forces a dataset-version bump pinned in
   `golden/baseline.json` and ~8 other places.
5. **New rules must not fire.** Exactly 15 exceptions / 7 blockers. Consignment ships informational,
   PPV stays a match-level attribute.

**Test budget per stage:** `shell.test.tsx` (13-label nav array), `overview.test.tsx` (KPI literals,
gate copy), `stage07.test.tsx` (reconciliation copy), `exception-detail.test.tsx` +
`evidence-truthfulness.test.tsx` (lens copy), `pass2-wording-pact.test.ts` (guide file path and the
three-noun attribution sentence), the three `vi.mock('../app/actions')` factories, and
`SPEC_MANIFEST.json` if any covered spec file is edited.

---

## 9. Requirements that would change baseline data — owner decisions

Stage A needs **none** of these. Everything below gates Stage B and later.

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Domain-aware lenses supersede the universal three-layer framing (`CANONICAL_SPEC` §2). | **Adopt** — the brief prescribes it explicitly. EXC-001/002 keep the canonical three as the flagship; other domains get their own. Record as a spec amendment. |
| **D2** | "Customer Site (Company-Owned)" location name + PBC-013 title state ownership as fact. | **Defer, no change.** These name what NetSuite *records* for units whose ownership is not in question; fix the *assertions* (D3) instead. Avoids a dataset bump for a naming nuance. |
| **D3** | `TPI-CONF-001` wording fix → rule v1.0.1. | **Adopt** — `docs/16` sanctions it; aggregates unchanged; RULESET stays v1.0.0. |
| **D4** | Overview headline 81.4% vs 81.42%. | **No change** — big number 81.4%, `81.42% · 8142 bps` beneath. Already the documented rounding rule. |
| **D5** ✅ **APPROVED** (owner, 2026-08-10) | Dataset bump **FY2026-DEMO-v1.1.0 → v1.2.0** for costing, R&D, consignment, scrap, PPV fixtures. | **Approved**, bundled: one regeneration, all aggregates byte-identical, only version/hash identity moves. Every new fixture must be generator-produced; update the `dataset_version` pin in `golden/baseline.json`, `packages/data/test/controls.test.ts`, `packages/rules/test/replay.test.ts`. |
| **D6** ✅ **APPROVED** (owner, 2026-08-10) | May a management conclusion resolve a blocker whose required evidence is still missing? | **No — wire the honest loop instead:** `Request evidence → Submit evidence → requirement satisfied → Conclude → blocker clears → sign-off enables`. Preserves "missing evidence never resolves to PASS" *and* closes the demo loop. A conclusion of "resolved" is offered only once the blocking requirement is satisfied; until then the recordable conclusions are the ones that keep it open. |
| **D7** | EXC-015 JE. | **Stays undrafted** (protects 66.67% / 81.42%). |
| **D8** | Close Memo is a separate management artifact, not PBC #22. | **Confirmed by the brief.** Workspace working state; excluded from replay. |
| **D9** ✅ **APPROVED with D5** | PPV: honest zero-PPV display vs seeded variance. | **Seed a small non-blocking variance** under D5; must remain match-level, never a 16th exception. |
| **D10** | Export (CSV + print) — absent from the brief, P0 in the critique. | **Build it.** Read-only, `QueryService`-only, role-scoped. |
| **D11** | Single in-memory workspace shared by all visitors. | **Out of scope this pass**; documented. Revisit only if the demo needs per-session isolation. |
| **D12** | `/assumptions`. | **Remove from nav** in Stage A; fold its content into Methodology in Stage F. |

Two standing guardrails inherited from `QA_RELEASE_GATE.md`: no screen may juxtapose the
CD-0512/CD-0513 warehouse count rows with the EXC-001 delivery timeline (that juxtaposition is what
the accepted EXC-001 tension decision depends on), and `Physical Count` keeps all four tabs.

---

## 10. Implementation sequence

Each stage ends with `pnpm test` + `pnpm typecheck` and a written report. No stage begins before the
prior one is green.

| Stage | Scope | Baseline decisions needed |
|---|---|---|
| **A — Credibility** ✅ **DONE** (`53769b5`, `cb73e2b`, `98688a5`, `8718d3e`) | Evidence Center; remove `/assumptions`; "How to Explore This Demo" + glossary; Overview hierarchy + 6 clickable KPIs + blockers filter; domain-aware exception lenses; coverage terminology; ownership language (rule v1.0.1); reconciliation canonical language + posted block; honest treatment of dead buttons; per-route titles, favicon, OG, `not-found`/`error`, footer, Print button. | None (D1–D4 resolved above) |
| **B — Inventory & GL** ✅ **DONE** (`3a359e7`, `de41445`) | All Inventory master list; GL accounts view; full JE detail; subledger-to-GL polish; **CSV export route handlers**. | D7, D10 |
| **W — Workflow verbs** ✅ **DONE** (`de41445`) | `concludeException` + `requestEvidence` + `submitEvidence` wired; live effective-state overlay; sign-off reachable at zero live blockers. | **D6** |
| **C — Procurement** ✅ **DONE** | Procurement section: 3WM re-host, GRNI, INR, GIT, PPV. **Carried the single D5 regeneration for C/D/E.** | D5, D9 |
| **D — Costing** ✅ **DONE** | Standard cost stack; fixed/variable/period classification; R&D; COGS state. **Fixtures already shipped in C — no further dataset bump.** | D5 ✅ |
| **E — Ownership & valuation lifecycle** | Custody model; consignment-in; E&O methodology; scrap & disposition. **Fixtures already shipped in C — no further dataset bump.** | D5 ✅ |
| **F — Management outputs** | Methodology & Calculations; Accounting Matrix; Close Memo with review workflow; guided-demo polish. | D8 |
| **G — Ask Gaurd** | Matcher hardening + routing harness, then ~10 grounded tools; memo drafting (prose-only). | — |
| **H — QA** | Baseline regression, accounting-language review, AI-off test, placeholder scan, 60-second demo test, full-tree adversarial pass. | — |

Nav grows with the stages: Stage A ships the grouped rail linking only to pages that exist; every
later stage adds its own child link as its page lands.

---

### Stage A outcome (2026-08-10)

**643 tests green** (628 at start; +15 new regressions), production build clean, every locked
figure unmoved: 1,500 units · $4,800,000 subledger · $4,812,450 GL · $12,450 difference ·
15 exceptions · 7 blockers · $198,950 exposure · $255,650 designed · 81.42% readiness ·
17/21 PBC · 91.67% source health.

Delivered beyond the plan: a `@media print` improvement (scrolling tables un-clip on paper),
and a shell-wide footer. Deliberately deferred out of Stage A: the per-GL-account table
(needs a new query — Stage B) and wiring the conclusion verbs (Stage W, gated on **D6**).

New regressions worth knowing about, because they pin rules rather than strings:
- every nav href must resolve to a real `page.tsx`, and neither `[section]/page.tsx` nor
  `NotDesignedScreen.tsx` may exist — the placeholder problem cannot return silently;
- no lens may say its evidence is "out of scope"/"not applicable" as filler;
- a missing-evidence chip may only resolve to the record the product itself lists as missing
  (this caught a real defect in the new EXC-015 support lens during the build);
- outstanding evidence gaps count open exceptions only;
- every Overview KPI is a link whose accessible name names its destination.

### Stage B + W outcome (2026-08-10)

**758 tests across 55 files**, production build clean, baseline restored exactly by Reset Demo.

Delivered: per-account GL reconciliation (1200 carries the whole difference, derived by reading
each item's GL entries); full JE detail with account descriptions, debit/credit, drafted date,
period adjusted, named preparer and support; CSV export for six tables through `QueryService`
only; the All-Inventory master population with custody as a first-class derived concept; and the
close loop — request → submit → conclude → blocker clears → sign-off — with readiness recomputed
through the rules' own `computeReadiness` and policy.

Design decisions worth remembering:
- A conclusion is **working state layered over** the derived close, never written into it. The
  effective-state module has no write path, so Reset Demo's restoration is structural.
- Evidence satisfies the requirement it **names**, matched exactly. An upload never satisfies a
  control by resembling it, and returned evidence stops satisfying anything.
- The Overview states when it is showing a session position and quotes the baseline it moved from.
- `scenario.ts` no longer defaults a proposal's offset account; an entry whose evidence does not
  settle its offset throws rather than booking one side against an account nobody chose.

**Still open from the audit:** the classification→GL map now exists in two places
(`queries.ts` exported, and `glAccounts.ts`'s mirror). Both are pinned against the query service
by tests, but they should collapse into the `INVENTORY_ACCOUNTING_MATRIX` in Stage F.

### Stage C outcome (2026-08-11)

**802 tests across 58 files**, typecheck/lint/build clean, 16 routes. Every locked figure
unmoved and verified in a browser, not only in tests: 1,500 units · $4,800,000 subledger ·
$4,812,450 GL · $12,450 difference · 15 exceptions · 7 blockers · $198,950 exposure ·
81.42% readiness · 17/21 PBC · 91.67% source health.

**The single D5 regeneration is done — dataset `FY2026-DEMO-v1.2.0`.** It carries everything
Stages C, D and E need, so neither D nor E bumps the dataset again. Regenerating produced a
diff of exactly what was intended: `vendorBills.json` (PPV) and `manifest.json` changed, four
new collections appeared, and every other fixture stayed byte-identical. New collections:
`costComponents` (70 rows), `periodCosts` (6), `consignmentInUnits` (12), `dispositions` (4).

Delivered: `/procurement` with five populations — three-way match (re-hosted from
Reconciliation, not rebuilt), received-not-invoiced, invoiced-not-received, inbound goods in
transit, and purchase price variance. `getProcurementPopulations` in `@icg/services`, CSV
export for the whole section, and the nav entry (13 sections).

Design decisions worth remembering:

- **No rule changed.** The populations are a projection over documents the close already
  read, so every golden figure is protected by construction. PPV lives in services, not in
  `PROC-3WM-001`.
- **Invoiced-not-received and inbound goods in transit are ONE population**, and the screen
  says so. The 4 orders billed but not received carry 55 units / $158,925; the book shows 55
  units / $158,925 classified GIT inbound. The service returns an `inboundAgrees` flag and
  the screen states the agreement, so no reader can add the two.
- **Account 1210 is reported whole** — 55 inbound + 60 outbound = 115 units / $390,300 —
  because reporting only the procurement half would put a smaller number beside the same
  account code on the GL-account screen.
- **PPV is expensed, not capitalized**, which is exactly why it can exist without touching a
  locked figure. It stays a match-level attribute; the native three-way match still passes on
  all three varying orders, and no sixteenth exception appears.
- The generator hands ONE `lines` array to the purchase order, the receipt and the bill.
  Repricing it in place would reprice all three; the bill gets a fresh array, and a regression
  pins that the order and receipt still carry the ordered price.
- New serials are minted from the same registry as the book population, so the lifecycle
  module must run **last** in `buildDataset` — minting earlier renumbers every unit generated
  after it.
- `WORKSPACE_SHAPE` now covers the dataset version too, not only `Workspace` fields. A cached
  v1.1.0 workspace would have served the Price Variance tab an empty population.

**Found and fixed while verifying in the browser:** the "Clean procurement cycle" card showed
$1,196,700 ordered against $1,199,562 billed under a footnote calling the legs matched. The
clean example now excludes orders carrying a variance, and any card whose bill differs from
its order names the difference on the vendor-bill leg.

**Found during Stage C, fixed immediately after it (before Stage D):** the CSV export routes
built in Stage B were **unreachable from the UI**. Nothing in `apps/web` linked to
`/api/export/*` or used the word CSV; the only way out of the product was to type a URL. That
is P0 3.2 above, which the route handlers had answered at the API level and nowhere else.

Closing it took more than seven links, because a link is a claim:

- All seven tables are now reachable from their screens, and `/`, `/physical-count` and
  `/valuation` state that their population has no export table rather than staying silent —
  the same reason this codebase never hides a disabled action.
- Every link is gated on `!data.restricted`, so no viewer is offered a download the handler
  would answer 403 to.
- Where the file is broader than the view, a `scopeNote` says so (`/cutoff` shows 2 of 15
  exceptions and downloads all 15; `/reconciliation` downloads the bridge from any of its
  three tabs).
- **Content defects the affordance would otherwise have shipped:** the inventory file's
  `Classification` and `GL account` columns were empty on all 1,500 rows (the handler asked
  the raw fixture for two fields that do not exist on it) — it now reads `listInventoryMaster`,
  the query the screen reads; the pbc file wrote `versions.length` where the screen renders
  `latestVersion`, so 15 rows read "1 version" beside a screen saying "None provided"; the
  exceptions file left `OPEN` standing in for *blocks sign-off*; reconciling items carried no
  `NOT POSTED` tag; and the auditor "Scope" line was applied by role to all seven tables
  including the four where an auditor's file is byte-identical to a Controller's.
- A 21-agent adversarial pass over the change confirmed 5 further defects, all fixed: the
  Overview claimed "each section below exports its own" (false three ways — a screen may not
  assert another screen's capability); the inventory file reported a SKU/bin count variance as
  a unit's own on 19 rows; and the procurement scope note promised a withheld-document count
  that only counts whole orders. Two of the confirmed findings were defects in the *new tests*,
  caught by mutation — both now kill the mutation that exposed them.

**Then the stated absences were closed too** (owner's call, before Stage D). `/physical-count`,
`/valuation` and the Overview gained their own tables — `physical-count`, `valuation` and
`close-summary` — so **ten tables now cover every population the product owns**, and
`ExportUnavailableNote` was removed with the last case for it. `/user-guide` is the only
navigable route without an export, correctly: it is prose, not a population.

A second 25-agent pass over those three tables confirmed a further set, all fixed. Every one
was the same shape — **a file quietly narrower than the record it claims to carry**:

- the movements section dropped the `quantity` and `reason` its schema requires, leaving five
  of six movements with neither an identity nor a size;
- the test-count section dropped `observation` and `traced`, making the floor-to-sheet
  discovery behind EXC-004 indistinguishable from the 41 clean tests;
- count plans dropped `nextCountDue`, which the file's own overdue indicators cite;
- `COUNT SUMMARY` is year-end-only while the sections below span all 13 plans, and nothing
  said so — "4 variance rows" sat above a results block holding more;
- the valuation file headed a location-selected section "DAMAGED AND RMA UNITS" (it contains
  no RMA units), dropped the per-row assessment state so a resolved exception read as open,
  and listed two review populations that are the identical 30 units with nothing saying the
  rows are lenses rather than segments;
- close-summary told Warehouse, Supply Chain and Legal to fetch the `pbc` table, which
  answers those three roles 403, and called an equal-weight mean "weighted" thirty lines under
  a table whose own column is headed Weight (%).

Four more were defects in the new tests, all found by mutation: a whole-file search for
"Not serial-identified" satisfied by a different section, a reserve-amount test that only
checked for presence (a derived reserve passed the whole suite), figures asserted with bare
`toContain` where two were tautologies, and a sweep asserting against an un-rendered DOM.
Each now kills the mutation that exposed it.

### Stage D outcome (2026-08-11)

**865 tests green across 61 files** (833 at start; +32: 20 in
`packages/services/test/costing.test.ts`, 11 in `apps/web/test/stageD-regressions.test.tsx`,
and 1 generated by the per-screen loop in `export-affordance.test.tsx`), typecheck, lint and
production build clean,
17 routes, nav is 14 entries. **No dataset work** — D5 stayed spent, and every locked figure is
unmoved: 1,500 units · $4,800,000 subledger · $4,812,450 gross GL · $12,450 difference ·
15 exceptions · 7 blockers · 81.42% readiness · 17/21 PBC.

Shipped: `packages/services/src/costing.ts` (`getCostStandards`, `getCostClassification`),
`apps/web/lib/server/costing-view.ts`, `CostingScreen.tsx`, `/costing` with four tabs, an
eleventh export table, and `COGS_STATES` + `COST_BEHAVIORS` in `@icg/domain`.

**The $4,800,000 decomposes exactly**, and the screen is allowed to say so only because the
service measures it: direct material $3,004,642 (62.60%), manufacturing overhead $753,712
(15.70%), direct labour $651,598 (13.57%), inbound freight $244,054 (5.08%), import duty
$145,994 (3.04%). The components are extended over the units ON THE BOOK, not multiplied out of
the SKU master, and a unit carried off its SKU's standard is excluded and counted rather than
spread — so `decompositionAgrees` is a conjunction of four conditions, not a total that happened
to match.

The period side is $3,030,000 across five categories, R&D $2,457,500 of it. The fixtures'
promise that these never reach `glBalances` is **checked against the recorded balances**
(`accountsInGlBalances`), not repeated in prose — that is the constraint keeping the locked
gross GL still, so it is enforced where a reader can see the enforcement.

**One real defect, found by reading the output rather than the code.** `O2C-CHAIN-001` emits
"… still on the year-end book" whenever fulfilled serials are on hand, *independently of the
component's state* — so SO-26190, which has no fulfillment at all, carries that sentence with
twenty serials. Printed beside a COGS state of "Not shipped" it reports twenty units as having
failed to relieve, when nothing shipped and there is nothing to relieve. The rule's prose is
never reworded, so the service flags the case (`expectedOnBook`) and the framing lives in the
view. Both the screen and the CSV are pinned against it, and the regression is mutation-tested:
restoring the raw note fails, and so does hard-coding the flag.

Two conditions the baseline cannot exercise are tested by creating them: a unit carried off
standard (decomposition must stop claiming agreement) and a period-cost account pushed into
`glBalances` (containment must report the violation). Without those, a projection that
hard-coded either boolean would have passed the whole suite.

**Found in the browser, deliberately not fixed:** PC-2026-0006's basis prose ends "capitalized
as the INBOUND_FREIGHT component of standard cost instead" — a raw enum name now visible in
user-facing copy for the first time. It is *fixture* prose generated in Stage C, so rewording it
regenerates the dataset and moves the manifest hash. That is exactly what D5 exists to prevent,
so it stays. Fold it into the next dataset bump, if one is ever justified on its own merits.

**Known, pre-existing, not Stage D:** `pnpm test` exits 1 on a vitest reporter RPC timeout
(`Timeout calling "onTaskUpdate"`) while reporting all tests passed. It reproduces at
`546e388` before any Stage D change. `export-affordance.test.tsx` blocks its worker for ~45s in
one test and starves the reporter channel; Stage D adds an eleventh screen to that sweep.

## 11. Acceptance criteria (the twenty questions)

The pass is complete when each of the brief's twenty questions is answerable **without relying on
AI-generated accounting truth**, and the answer is traceable to structured state:

what we have · where it is · who owns it · what it costs · which costs belong in inventory · what
happened to it · which GL account holds it · whether subledger agrees with GL · what explains the
difference · what JE is proposed · received-not-invoiced · invoiced-not-received · incomplete
three-way matches · third-party and consignment custody · E&O and scrap concerns · supported COGS
impact · what prevents sign-off · what evidence is missing · what management must conclude · whether
a defensible Inventory Close Memo can be produced from controlled state.

Stage H verifies all twenty against the live build.
