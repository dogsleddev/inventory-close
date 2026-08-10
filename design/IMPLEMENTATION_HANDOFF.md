# Inventory Close Gaurd — Implementation Handoff

**Status:** approved design output of `prompts/design/07_FINAL_DESIGN_REVIEW_AND_POLISH.md`.

**Source of truth:** `design/07_final/ICG-Design-Handoff.html` (Claude Design export,
sha256 `BC26298EBECC57A1…`). This markdown is a faithful, greppable distillation of that
export for `prompts/code/05`–`07`; where the two ever disagree, **the HTML export wins**.
Screen-level visual truth lives in the seven exports under `design/00_master` … `design/06_audit-ai`.

**This document adds no financial logic.** Every number below is the locked baseline in
`CANONICAL_SPEC.md`; all runtime values come from `@icg/services`, never from the UI.

---

## 0. Review outcome (design 07)

- **11 financial figures audited across every screen — all match the baseline exactly.**
  Book units 1,500 · gross subledger $4,800,000 · gross GL $4,812,450 · GL difference $12,450 ·
  active blockers 7 · blocker exposure $198,950 · designed exceptions 15 · Close Readiness 81.42% ·
  PBC 17/21 · PBC readiness 80.95% · Data Health 91.67%.
  Close Readiness renders **81.4%** at Overview scale and **81.42% · 8142 bps** wherever the
  weighted calculation is shown. That is the documented rounding rule, not drift.
- **8 semantic distinctions verified as never conflated** (see §6).
- **2 defects found and fixed during the pass:** duplicate KPI treatment between App Shell and
  Overview (the shell now carries the single canonical sign-off gate), and workspace panels
  crushing under scroll (every direct child of a workspace column sets `flex-shrink: 0`).

---

## 1. Screen inventory

| Screen | Owns | Export | State |
|---|---|---|---|
| Design language | Tokens, type scale, status vocabulary, panel hierarchy, state treatments | `00_master/ICG-Design-System.html` | Reference |
| App shell | Nav, global header, role selector, drawer arbitration, not-designed-yet state | `01_shell/ICG-App-Shell.html` | Designed |
| Overview | Sign-off gate, Preventing Sign-Off, attention queue, activity, close areas, source health | `02_overview/ICG-Overview.html` | Designed |
| Exception detail | Three-Layer Reality, transaction chain, why flagged, evidence state, evidence drawer | `03_exception/ICG-Exception-EXC-001.html` | Designed |
| Financial Life of the unit | Four-phase chain of custody, relationship legend, cycle history, accounting position | `04_financial-life/ICG-Financial-Life-KE-E2-1048.html` | Designed |
| **Physical Count** | Year-end count, cycle history, auditor test counts, count movements | **MISSING FROM REPO — see §9** | Designed (not saved) |
| Reconciliation | Financial bridge, procurement match, commercial chain, serial integrity | `05_counts-reconciliation/ICG-Reconciliation.html` | Designed |
| Audit Package + Ask Gaurd | PBC workspace, lineage, version sealing, four assistant states | `06_audit-ai/ICG-Audit-Package.html` | Designed |
| Valuation · Adjustments | EXC-011 reserve workspace; proposal register | — | Not designed (see §9) |

---

## 2. Component inventory, variants, and reuse map

Twenty-two components carry the whole product. **The reuse count is the build-order argument:
anything used on four or more screens is built once and shared, never re-implemented per screen.**

| Component | States / variants | Used on | Reuse |
|---|---|---|---:|
| App frame | Nav rail · header · workspace · right rail | All application screens | 7 |
| Nav rail | Active · hover · badge · start-here · role footer | All application screens | 7 |
| Contextual header | Breadcrumb · title · period tags · actions | All application screens | 7 |
| Status capsule | 7 workflow states · glyph + label | Everywhere | 7 |
| Standard panel | Hairline · recessed sub-panel | Everywhere | 7 |
| Ask Gaurd drawer | Default · material answer · restricted · unavailable · collapsed rail | All application screens | 7 |
| Non-result states | Loading · zero · no records · unavailable · restricted · stale · AI down | Everywhere | 7 |
| Source chip | NetSuite filled · third-party outline · stale · partial · failed | Overview, Exception, Life, Recon, PBC | 6 |
| Data table | Header · row · hover · footer bar · nested detail | Overview, Count, Recon, PBC | 6 |
| Decision panel | Ember top rule · one per screen | Overview, Exception, Life, Recon, PBC | 6 |
| Risk indicator | Critical ◆ · High ● · Medium ● · Low ○ | Overview, Exception, Count, Recon | 5 |
| Audit Details | Collapsed · expanded key/value grid | Exception, Recon, PBC, drawers | 5 |
| Evidence chip | Known ✓ · corroborating ≈ · conflicting ✕ · missing ○ | Exception, Life, PBC | 4 |
| Tab bar | Ember underline · optional count | Count, Recon, PBC detail | 3 |
| Chain strip | Present · corroborating · conflicting · missing · weighted flex | Exception, Life, Recon | 3 |
| Three-layer band | NetSuite · physical · accounting + interpretation strip | Exception (canonical), Life, Recon | 3 |
| Evidence drawer | Record · occurred vs retrieved · original vs normalized · missing variant | Exception, Life | 2 |
| Object drawer | Summary · conclusion · actions | App Shell, Overview | 2 |
| Timeline | Dated events · undated missing block held outside | Exception, App Shell | 2 |
| Bridge rows | Opening · reconciling · net · hypothetical total | Reconciliation, Adjustments (P1) | 2 |
| Version row | Editable draft · sealed provided · superseded · archived | Audit Package | 1 |
| Lineage path | 4-node horizontal · terminating-in-absence variant | Audit Package | 1 |

**Build order implied:** the seven reuse-7 components plus Source chip, Data table, and Decision
panel form the shared kit for code stage 05; Chain strip, Three-layer band, and Evidence drawer
are the flagship-specific set; Version row and Lineage path are Audit-Package-only (stage 07).

---

## 3. Desktop geometry

| Element | Value |
|---|---|
| Design canvas | 1440 × 900 |
| Nav rail | 204px fixed |
| Ask Gaurd drawer | 320px |
| Object / evidence drawer | 340–352px |
| Collapsed rail | 42px |
| Global header | 44px |
| Workspace padding | 16px 20px 24px |
| Panel gap | 12px |
| Table row | 34–36px |
| Radius | 8px panel · 4px chip |

---

## 4. Interaction notes

- **Drawer arbitration** — Ask Gaurd and the object drawer are mutually exclusive; opening one
  closes the other so the workspace narrows once, never twice.
- **Rail persistence** — collapsed-rail state and theme persist per user; theme reads from
  storage before first paint.
- **Row activation** — the whole row is the hit area. The row opens a drawer; the ID cell inside
  navigates to the full object.
- **Chips** — every source and evidence chip opens the same record drawer regardless of screen:
  one destination per record.
- **Audit Details** — collapsed by default everywhere, and its state is not remembered between objects.
- **Disabled actions** — never hidden. Render dashed with the reason directly beneath, e.g.
  "Unavailable — 7 blockers open".
- **Tabs** — client-side, no reload; the tab does not change the object in the drawer.

---

## 5. Responsive rules

| Breakpoint | Behavior |
|---|---|
| ≥1440 | Canonical. Both rails may be open. |
| 1280–1439 | Right rail collapses to 42px by default; KPI grids drop to 3 columns. |
| 1024–1279 | Nav rail becomes icon-only 56px; two-column workspace stacks. |
| <1024 | Read-only review. Conclusion and evidence-request actions are **removed, not disabled**. |
| Print | Workpaper export follows the panel order of the screen; drawers print as appendices. |

This is a desk product. Below 1024px it degrades to read-only review; conclusions are never
recorded on a phone.

---

## 6. Semantic distinctions — how each is held in the UI

These are build requirements, not guidance. Each pair must remain visibly separate.

| Must never conflate | How the design holds it |
|---|---|
| NetSuite state vs. accounting conclusion | Separate columns in Three-Layer Reality; the conclusion is always a distinct panel with its own author and timestamp. |
| Physical location vs. ownership | The "Location is not ownership" strip on EXC-001; deployment evidence never resolves the cutoff question. |
| Cycle count vs. auditor reliance | Count history is tagged MANAGEMENT RISK CONTEXT; no sampling language, no Generate Sample control. |
| Native control vs. close control | Mono grey NS tag vs. sans capsule, side by side on Procurement Match, with a footnote naming the two questions. |
| Proposed vs. posted adjustment | Dashed border and a literal NOT POSTED tag on every proposal; posted state is solid and requires a JE reference. |
| PBC Ready vs. auditor approval | No acceptance state exists. Audit Details states "Auditor acceptance — not recorded in this system". |
| AI explanation vs. evidence | Every Ask Gaurd panel carries the non-evidence disclaimer; answers cite chips that resolve to real records. |
| Chain completeness vs. confidence | "7 of 8" is set in quiet type beside the missing component in ember; never a score, ratio bar, or percentage. |

---

## 7. Accessibility — build requirements

- Body text meets 4.5:1 in both light and dark; the two palettes are separately verified, not derived.
- Status is never colour alone — glyph plus text label is mandatory on every state chip.
- 2px frost focus ring on all interactive elements, offset 2px, never removed on mouse input.
- Tables use real `th`/`scope` semantics; the row hit area is a button, not a div with a handler.
- Tabular numerals on all money and quantity so column scanning cannot misread a digit.
- Minimum 32px interactive target in dense tables; 44px on any control below 1024px.
- Drawer open moves focus to its heading and traps tab; Escape closes and restores focus to the source row.
- Missing evidence is announced as "missing, required" to assistive tech — never as an empty cell.

---

## 8. The 60-second demo path (exact screens and states)

| # | Clock | Step | What the viewer sees | State |
|---|---|---|---|---|
| 01 | 0:00–0:10 | Overview | 81.4% ready, 7 blockers, $198,950, $12,450 difference — all above the fold. | Light · rails collapsed |
| 02 | 0:10–0:18 | Open EXC-001 | Primary CTA on the gate opens the highest-risk cutoff item directly. | Row → full object |
| 03 | 0:18–0:32 | Three-Layer Reality | Warehouse / deployed / provision missing, then "Location is not ownership". | No scroll |
| 04 | 0:32–0:42 | Transaction chain | Seven present, one absent and drawn largest in ember dash. | No scroll |
| 05 | 0:42–0:54 | Ask "Why is this still open?" | Structured answer; the Missing Evidence block declines to infer the term. | Ask Gaurd open |
| 06 | 0:54–1:00 | End on the conclusion | Management conclusion: Open. Next action with Legal. Nothing was decided by software. | Conclusion panel |

**Demo preconditions:** light mode, Ask Gaurd rail collapsed, Audit Details collapsed everywhere,
theme persisted so the first frame does not flash. **Step 5 must land on the Missing Evidence
block** — the refusal is the moment the product is understood, and it is the only place in the
demo where the assistant declines to answer.

Acceptance tests carried from the design review:
- **10 seconds:** year-end inventory close · 81.4% ready · 7 blockers · $198,950 exposure, all above the fold.
- **30 seconds:** NetSuite says Warehouse · evidence says deployed before year-end · accounting evidence missing · conclusion Open, all in the three-layer band without scrolling.
- **60 seconds:** Close Gaurd connects NetSuite, physical operations, and accounting evidence while preserving human accounting judgment.

---

## 9. Known gaps — designed coverage that does not exist as an export

1. **Physical Count screen is missing from the repository.** The design-07 inventory lists
   `ICG Physical Count` as *Designed* (year-end count, cycle history, auditor test counts, count
   movements — `prompts/design/05` Parts A and B), but no such file was saved; only
   `ICG-Reconciliation.html` (Part C) is in `design/05_counts-reconciliation/`.
   **Code stage 06 needs it.** Either export it from the design session into
   `design/05_counts-reconciliation/ICG-Physical-Count.html`, or build stage 06's count tabs from
   the Reconciliation and Financial Life patterns plus the prompt-05 specification.
2. **Valuation (EXC-011 reserve workspace)** — not designed, explicitly not blocking. Build on
   the exception-detail pattern; **the reserve conclusion must stay UNDETERMINED until management
   sets it.** Referenced from Overview, Reconciliation, and PBC-018.
3. **Adjustments (register of the three proposals)** — not designed, explicitly not blocking.
   Reuse the Reconciliation bridge rows verbatim; **every row must read NOT POSTED.**
4. **Cutoff and Ownership** — both are filtered views of the exception list; the shell's
   "not designed yet" state covers them until built.

---

## 10. Explicitly P2 — must not block the build

| Deferred | Why |
|---|---|
| Saved views and filters | The demo path never filters. Ship the fixed sorts first; persistence can follow. |
| Bulk actions on exceptions | Every conclusion in scope is individual and reasoned. Bulk risks the opposite habit. |
| Notifications and digests | Owner and due date already carry the handoff inside the product. |
| Ask Gaurd conversation history | Investigation is scoped to one object; transcripts are not evidence and should not accumulate. |
| Comment threads | The append-only review history already records who said what and when. |
| Configurable readiness weights | Weights are locked for this dataset; making them editable invites moving the target. |
| Dark-mode print styling | Workpapers print light. Not worth a second print stylesheet. |
| Cross-period comparison | One period exists. Add when a second close is real, not as a placeholder chart. |

---

## 11. Notes for implementation

- **Design tokens** live in the `:root` block of every export (parchment `--bg:#EDE3CD`,
  `--panel:#F7F0DE`, `--ink:#0E1116`; accents `--ember:#C25431`, `--aurora:#2A8E6D`,
  `--frost:#4A779E`, `--warn:#8A6320`; dark rail `#0E1116`). Fonts: Fraunces (display serif),
  Geist (UI sans), Geist Mono (serials and money). Light and dark are **separately verified
  palettes, not derived** — carry both.
- The exports are self-extracting bundles: the page HTML is a JSON string literal on a single
  long line beginning `"<!DOCTYPE`. Split on newlines, find it, `JSON.parse` it.
- Every figure the UI renders must come from `@icg/services` query results. No accounting logic
  in components, no hard-coded totals — the deterministic core already produces all of them, and
  code stage 03's golden tests pin them.
