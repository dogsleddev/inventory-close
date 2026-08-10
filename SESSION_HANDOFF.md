# Inventory Close Gaurd — Session Handoff

**Purpose:** everything a fresh Claude Code session needs to continue this build without
re-deriving decisions or breaking locked facts. Written 2026-08-10 after code stage 07.

> The product name is deliberately spelled **Gaurd**, never "Guard". Do not "fix" it.

---

## 0. Start here

**The next task is code stage 09 — demo reset, replay, and QA.** Everything it depends on is
done and committed.

1. Read this document, then `CANONICAL_SPEC.md`, then **`design/IMPLEMENTATION_HANDOFF.md`**
   (component/reuse map, geometry, interaction rules, accessibility, demo states, and the
   mockup defects in §9a you must correct rather than replicate).
2. Verify nothing drifted: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — expect
   **524 tests passing**. **Stop any `pnpm dev` server first** (see §7).
3. Follow `prompts/code/09_DEMO_RESET_REPLAY_AND_QA.md`. All figures come from `@icg/services`;
   no accounting logic in components or prompts; no hard-coded totals.

Stage 09 is unblocked: `resetWorkspace()` and `reproduceClose()` already exist, the audit log
already survives a reset, and every screen and Ask Gaurd itself read the same query service.

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

## 2. Current state (verified after code stage 07)

- Repo: `C:\dev\Inventory Close`, branch `master`, **no git remote** (local only).
- Node v24.14.1, pnpm 11.5.3, Windows/PowerShell.
- **524 tests passing**; typecheck, lint, and production build all green.
  (Stage 06's handoff recorded 376 at `e18d94e`; the tree actually ran **375** there — an
  off-by-one in the note, not a skipped test.)
- All 44 `SPEC_MANIFEST.json` hashes match disk — the spec package is pristine.
- Committed dataset hash: `7588ce733b2119dfbf95b95b72741d37b1bacfd555e0369af96a29991e57af06`.

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
| Code 09–10 | Not started. **Code 09 (reset / replay / QA) is next** — see §8. |

### Commit history (newest first)

```
4552c9b Stage 08 fleet remediation: 18 confirmed defects fixed
e343f2e Stage 08 UI: the Ask Gaurd drawer over the deterministic engine
2eaab1e Stage 08 core: Ask Gaurd tools, deterministic answers, and guardrails
65716d0 Record the stage-07 fleet outcome and the invariants it established
36dafe5 Stage 07 fleet remediation: 9 defects fixed
d8d69ec Refresh SESSION_HANDOFF.md for code stage 08
04fe79b Code stage 07: reconciliation bridge, adjustments, valuation, audit package
ae9f4bd Record stage-06 fleet outcome and the invariants it established
e18d94e Stage 06 fleet remediation: 16 confirmed defects fixed
1ab0a0d Refresh SESSION_HANDOFF.md for code stage 07
ffbb2a8 Code stage 06: Financial Life, Physical Count, and NetSuite chains
a856e9f Refresh SESSION_HANDOFF.md for code stage 06 and ignore local Claude settings
3a4dc6b Code stage 05: core UI (Overview, Exceptions, EXC-001) + fleet remediation
3096d0e Refresh SESSION_HANDOFF.md for a new session at 75dc3b2
75dc3b2 Record two mockup copy defects found by independent screen review
28ff2d9 Handoff-doc corrections from verification fleet + close a silent test-skip trap
24b8309 Design 07 complete: approved handoff exports plus IMPLEMENTATION_HANDOFF.md
e0a603b Stage 04 fleet remediation: 10 confirmed defect clusters fixed
5e6a461 Stage 04 follow-up: lineage redaction and PBC version/dependency model
a02bf35 Stage 04: application services, evidence graph, workflows, security, audit
cad38bb Stage 03 fleet remediation: 7 confirmed defect clusters fixed
e8b7d12 Stage 03: deterministic rule engine, scenario replay, and golden tests
548afd3 Close out stage 01 review findings recovered from prior-session journal
ff89a3b Stage 02 review remediation: timeline coherence and deterministic cycle stories
31f2765 Stage 02: deterministic FY2026 dataset generator and NetSuite fixtures
17ffb31 Complete stage 01 review remediation: full AuditEvent shape per docs/15
9f286d5 Design stages 00-04 outputs and code stage 01 foundation
cfbd22d Correct docs/13 build-order mnemonic to match CANONICAL_SPEC section 16
46c6122 Pristine Inventory Close Gaurd specification kickoff package
```

---

## 3. Non-negotiables

### Locked financial baseline — never silently change any of these

Dataset `FY2026-DEMO-v1.1.0` · seed `ICG-FY2026-DEMO-002` · scenario `SCENARIO-EVENTS-v1.1.0`

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
design/IMPLEMENTATION_HANDOFF.md   <- markdown distillation of it; what code 05-07 read
apps/web/                          <- Next.js App Router skeleton (placeholder page only)
packages/
  domain/       types, enums, Zod schemas, money/dates, repositories   (zero deps but zod)
  data/         deterministic generator, committed fixtures, toCloseInput,
                read-only NetSuiteAdapter, demo users
  rules/        21 rules, registry, scenario replay, reconciliation, readiness, runClose
  evidence/     evidence graph, sha-256 lineage, exception→source traversal
  permissions/  explicit role matrix, authorize(), SOD, restricted-content gate
  workflows/    period + review state machines with append-only history
  audit/        append-only audit log (no mutation API)
  services/     workspace, query services, command services, demo reset
  ai/ mcp/      stubs (Stage 08+)
```

Key files a new session will want first: `packages/rules/src/close.ts` (the orchestrator),
`packages/rules/src/policy.ts` (readiness tiers + PBC baseline), `packages/services/src/queries.ts`,
`packages/data/src/allocation.ts` (frozen), `golden/baseline.json`.

---

## 5. Authored decisions (not in the spec — don't re-litigate or accidentally revert)

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
7. **Auditor scoping** — the auditor sees only evidence under **PROVIDED** workpapers; management
   indicators are never auditor-facing.
8. **Not yet typed:** docs/06 objects for later stages (CloseTask/Readiness,
   AiInteraction/ToolCall/Citation/Draft/Session, TechnicalAccountingReview/LegalReview, …) arrive
   with their stages. This is deliberate staging, not an omission. **Contract and Shipment are
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
- **Adversarial fleet review after each stage** (the pattern used for 02/03/04/05/06): 5 finder
  lenses in parallel → dedupe → one skeptic verifier per finding at high effort → apply confirmed
  fixes with regression tests → re-run gate → commit. It has confirmed real latent defects every
  single time (7 clusters in stage 03, 10 in stage 04, 9 in stage 05, 16 in stage 06, 9 in
  stage 07, **18 in stage 08**), so don't skip it.
- **Add a lens that tries to BREAK the stage, not review it.** Stage 08's red-team — told to
  execute an attack and only report ones it observed succeeding — found five guardrail bypasses
  that a code-reading lens would have called defensible.
- **Write regressions as categories, not instances.** Stage 08's review criticised the original
  suite harder than the code: "each gap is the shape of a test that asserts an instance where the
  contract states a category". The replacements iterate every exception, every serial with a
  scope difference, every shipped chip.
- Stage 07 ran **two** skeptics per finding with different jobs — one told to refute and to
  default to refuted when uncertain, one told to reproduce the failure by running code. Confirm
  only when both fail to refute; a split is **contested**, to be adjudicated inline rather than
  dropped. Four of the five contested findings turned out to be real. A dedicated lens pointed
  at the stage's own authored interpretations is worth one agent slot.

---

## 7. Open items and traps

**Needs your attention:**

- **The Physical Count screen was designed but never exported into the repo** — design 07's screen
  inventory lists `ICG Physical Count` as *Designed*, but only `ICG-Reconciliation.html` (Part C)
  was saved. *Decided 2026-08-09: it will NOT be exported.* **Settled** — stage 06 built
  `/physical-count` from the Reconciliation + Financial Life patterns plus the `prompts/design/05`
  Parts A/B spec. Nothing further is owed here.
- Valuation (EXC-011 reserve) and Adjustments were **deliberately not designed**; stage 07 built
  them on the exception-detail and bridge-row patterns as `design/IMPLEMENTATION_HANDOFF.md` §9
  directed. **Settled** — nothing further is owed here.
- **Fleet-review agents can leave artifacts despite read-only instructions.** The stage-07
  review left an empty `x.html` in the repo root (a stray shell redirect). Check
  `git status --porcelain` after a review and before staging; never `git add -A`.
- **A third §9a-class mockup copy defect** was found in `05_counts-reconciliation`: the Financial
  tab asserts "Two of the three are still open items" and "Not reachable — 2 items open", but its
  own bridge rows show one open item (EXC-015; EXC-009 and EXC-014 are both resolved). The
  implementation counts it from close state instead. Do not replicate the mockup's number.
- `design/05_counts-reconciliation/ICG-Reconciliation.html` was **accidentally swept into commit
  `e0a603b`** by a `git add -A` during Stage 04 remediation; that commit message doesn't mention it.
  Harmless to the tree, but the history is misleading if that matters to you.

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
  jsdom suites plus a Next dev server exceed available RAM. Stop the dev server first.
- **Never rewrite a source file with PowerShell `Get-Content -Raw` + `Set-Content`.** PS 5.1
  reads as ANSI, so every em dash, `·`, `§` and status glyph comes back as mojibake; it type-
  checks and lints clean and only shows up as garbage in the rendered UI. Use the Edit tool.
  To check: `Get-ChildItem -Recurse -Include *.ts,*.tsx,*.css apps,packages | ForEach-Object
  { if ([IO.File]::ReadAllText($_.FullName) -match '[âÃÂ]') { $_.FullName } }`.

---

## 8. What to do next

1. **Code 09 — demo reset, replay, QA.** `resetWorkspace()` rebuilds derived state and keeps the
   audit log; `reproduceClose()` compares structured output and returns MATCH/MISMATCH. **LLM
   prose is excluded from replay equivalence** (CANONICAL_SPEC §15), so replay must compare the
   structured answer object — tool calls, section payloads, figures, evidence ids — and never
   hash generated prose.
2. Then 10 (polish / deployment — note stage 10 edits the
   manifest-covered root `README.md`; see the `SPEC_MANIFEST.json` trap in §7).

**What stage 08 established that later stages must not undo:**

- **There is ONE restricted-content redactor**, `packages/services/src/redaction.ts`. An evidence
  item carries the retrieved value twice (`content` and `originalValue`) and the fixture pipeline
  is an identity transformation, so clearing one and spreading the other discloses everything.
  That bug shipped in stage 04, was fixed in `traceLineage` in stage 08, and then turned out to
  exist in a **second copy** in `commands.ts`. If a third copy of the value is ever added to an
  evidence shape, `redactRestricted()` is the one place that learns about it.
- **Ask Gaurd's answer is deterministic; only `narration` is generative.** Every figure, status,
  conclusion and citation is read from a tool result, so "numeric values must match tool results
  exactly" holds by construction. There is no provider bound anywhere — the engine IS the answer,
  which is why the "disable the AI provider" acceptance test is the normal case here.
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
