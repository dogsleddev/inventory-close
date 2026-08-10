# Inventory Close Gaurd — Session Handoff

**Purpose:** everything a fresh Claude Code session needs to continue this build without
re-deriving decisions or breaking locked facts. Written 2026-08-09 at commit `e0a603b`.

> The product name is deliberately spelled **Gaurd**, never "Guard". Do not "fix" it.

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

## 2. Current state (verified at `e0a603b`)

- Repo: `C:\dev\Inventory Close`, branch `master`, **no git remote** (local only).
- Node v24.14.1, pnpm 11.5.3, Windows/PowerShell.
- **204 tests passing**; typecheck, lint, and production build all green.
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
| Code 05–10 | Not started. **Code 05 is now UNBLOCKED** — the design handoff exists. |

### Commit history (newest first)

```
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
4. **PBC baseline** — which of the 21 items are Provided/Ready/Preparing/Follow-Up/Not-Started is
   authored in `policy.ts`, correlated with the open exceptions (E&O preparing because EXC-011,
   tracker follow-up because EXC-007).
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
- **Adversarial fleet review after each stage** (the pattern used for 02/03/04): 5 finder lenses in
  parallel → dedupe → one skeptic verifier per finding at high effort → apply confirmed fixes with
  regression tests → re-run gate → commit. It has confirmed real latent defects every single time
  (7 clusters in Stage 03, 10 in Stage 04), so don't skip it.

---

## 7. Open items and traps

**Needs your attention:**

- **The Physical Count screen was designed but never exported into the repo.** Design 07's own
  screen inventory lists `ICG Physical Count` as *Designed* (year-end count, cycle history,
  auditor test counts, count movements — `prompts/design/05` Parts A/B), but only
  `ICG-Reconciliation.html` (Part C) was saved. **Code stage 06 needs it.** Either export it to
  `design/05_counts-reconciliation/ICG-Physical-Count.html` or build stage 06's count tabs from
  the Reconciliation + Financial Life patterns plus the prompt-05 spec.
- Valuation (EXC-011 reserve) and Adjustments screens are **deliberately not designed** and marked
  not-blocking; build them on the exception-detail and bridge-row patterns respectively.
  See `design/IMPLEMENTATION_HANDOFF.md` §9.
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
- **There is no UI test infrastructure yet, and the gate cannot tell you that.** `vitest.config.ts`
  collects `packages/*/test/**` and `apps/*/test/**` with `environment: "node"`; no jsdom,
  happy-dom, `@testing-library/*`, or React plugin is installed, and `apps/web` has no `test/`
  directory. The include glob now matches `.test.ts` **and** `.test.tsx` so a UI test can never be
  silently skipped — but a `.test.ts(x)` file placed outside a `test/` directory still matches
  nothing and is ignored without warning. Stage 05 must install the browser-environment deps it
  needs; until then a green gate says nothing about UI correctness.
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

---

## 8. What to do next

1. **Code 05** — `prompts/code/05_CORE_UI_OVERVIEW_AND_EXCEPTIONS.md`: shell, Overview,
   Exceptions, EXC-001 with three-layer reality and the transaction chain. Read
   `design/IMPLEMENTATION_HANDOFF.md` first — it carries the component/reuse map, geometry,
   interaction rules, and the eight semantic distinctions the UI must hold. All data comes from
   `@icg/services`; no accounting logic in components, no hard-coded totals.
2. Then code 06 (Financial Life / counts / chains — note the missing Physical Count export in §7),
   07 (reconciliation / valuation / PBC), 08 (Ask Gaurd — services are stable, so it's unblocked
   whenever), 09 (reset / replay / QA), 10 (polish / deployment).

The 60-second demo path the UI must serve:
`Overview → EXC-001 → NetSuite vs Physical vs Accounting → Transaction Chain → Ask Gaurd`.
