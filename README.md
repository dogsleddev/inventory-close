# Inventory Close Gaurd

> **The evidence layer between NetSuite inventory operations and the financial close.**

An independently created prototype for the fictional company **KestrelGrid AI**, built on
fully synthetic FY2026 data. It answers one question about a physical unit:

> What is the complete financial story of this unit, and does the year-end accounting agree
> with the evidence?

NetSuite stays the system of record. Operational systems establish what physically happened.
Gaurd reconciles the two into accounting evidence, and says plainly where they disagree.

The product name is deliberately spelled **Gaurd**.

---

## The thesis

Operational data tells you what happened. Accounting evidence determines what belongs on the
books. Most close tooling blurs the two — a unit that shipped is assumed to be a unit that was
sold. Gaurd holds them apart and shows the gap:

- **NetSuite says** the unit sits in the warehouse at December 31.
- **Physical evidence says** it shipped on the 27th, was delivered on the 29th, and came
  online at the customer site on the 30th.
- **Accounting evidence says** the contract provision governing transfer of control cannot be
  located.
- **The conclusion stays Open**, because location is not ownership and no amount of
  operational certainty substitutes for the missing term.

Software does not resolve that. A controller does.

### Deterministic Core, Generative Edge

Every figure, status and conclusion is produced by versioned, pure rule functions over an
immutable dataset. The assistant may *explain* a control result; it may never *create* one.
No AI provider is bound anywhere in this repository — Ask Gaurd's answers are read from the
same services the screens use, so the product behaves identically with AI unavailable, and
the UI says so on every answer.

---

## What it is not

- **Not a NetSuite replacement, product, or affiliate.** It reads; it never writes. There is
  no mutation method on the adapter and no code path that posts, approves, or relieves
  anything.
- **Not audit approval.** PBC readiness measures management preparation. No state in this
  product records what an external audit team concluded, and none can be added without
  changing what the word means.
- **Not a compliance claim.** Nothing here asserts conformance with any auditing or
  accounting standard, framework, or regulator.
- **Not autonomous accounting.** Gaurd proposes and explains. Every conclusion is recorded by
  a person.
- **Not hallucination-free AI.** The guarantee is narrower and testable: figures and record
  identifiers never come from a model, because generated prose may not carry them at all.

---

## Canonical baseline

All synthetic, all derived from the seed — never hard-coded in the application.

| | |
|---|---|
| Dataset · seed · scenario | `FY2026-DEMO-v1.1.0` · `ICG-FY2026-DEMO-002` · `SCENARIO-EVENTS-v1.1.0` |
| Balance-sheet date | December 31, 2026 |
| Book inventory | 1,500 units · $4,800,000 gross carrying value |
| Gross inventory GL · difference | $4,812,450 · **$12,450** over subledger |
| Designed exceptions | 15 — 7 open / 8 resolved |
| Blockers · exposure | 7 · $198,950 (total designed exposure $255,650) |
| Close readiness | 81.42% (8142 bps) |
| PBC readiness | 17 / 21 = 80.95% |
| Source health | 91.67% |

`Reproduce Close` rebuilds the dataset from its seed, re-runs every rule, and compares the
structured output — reporting MATCH or MISMATCH and naming what moved. `Reset Demo` restores
the baseline by re-deriving it, never by restoring a stored snapshot.

---

## Architecture

```
apps/web          Next.js App Router. Page data is assembled in lib/server/*-view.ts;
                  components receive JSON-safe view models and hold no accounting logic.
packages/
  domain          Types, enums, Zod schemas, money and dates. Zero @icg dependencies.
  data            Deterministic generator, committed fixtures, read-only NetSuite adapter.
  rules           21 versioned rules, scenario replay, reconciliation, readiness, runClose.
  evidence        Evidence graph, sha-256 lineage, exception to source traversal.
  permissions     Explicit role matrix, authorize(), segregation of duties.
  workflows       Period and review state machines with append-only history.
  audit           Append-only audit log — no update or delete API exists.
  services        Query and command services, demo reset, redaction, PBC versions, replay.
  ai              Ask Gaurd: approved tools, deterministic answer engine, guardrails.
```

Dependency direction is enforced by lint and tests: **UI / Ask Gaurd → services → domain and
rules → repositories**. Money is integer cents; readiness is integer basis points. Rules are
pure — no clocks, no randomness, no I/O — and return PASS / FAIL / REVIEW_REQUIRED /
INCOMPLETE / NOT_APPLICABLE with evidence coverage tracked separately. **Missing required
evidence never becomes PASS.**

---

## Setup

Requires Node 20+ (developed on 24) and pnpm 11.

```bash
pnpm install
pnpm --filter @icg/web dev
```

Then open <http://localhost:3000>. **No environment variables are required** — there is no
database, no NetSuite connection, and no AI provider. See `.env.example`, which lists names
only and explains why the list is empty.

```bash
pnpm --filter @icg/web build && pnpm --filter @icg/web start   # production
```

---

## Testing

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

That four-command gate is the release gate; `QA_RELEASE_GATE.md` records the acceptance
matrix from `docs/14_QA_ACCEPTANCE_CRITERIA.md` with the test evidence for each category.

Beyond the usual unit and UI coverage, the suite pins the things that make this product what
it claims to be: the golden accounting scenarios and every locked control total, dataset
reproducibility byte-for-byte from the seed, the read-only NetSuite boundary, permissions and
segregation of duties, adversarial Ask Gaurd tests, and repo-wide scans under `test/` that
fail the build if any identifier in shipped source has gone stale or if anything
credential-shaped appears.

---

## Demo

The 60-second path:

**Overview → EXC-001 → three-layer reality → transaction chain → Ask Gaurd "why is this still
open?"** — closing on a management conclusion of Open, reached by a person.

Start at **User Guide** in the nav rail for the guided version, the secondary paths (Financial
Life of the Unit, Reconciliation, Audit Package), and the role switcher. `Reset Demo` in the
header restores the baseline; every screen reads the workspace it rebuilds.

---

## Synthetic data disclosure

Every company, customer, vendor, employee, contract, serial number, transaction, audit
request, workpaper and financial figure in this repository is **fictional and synthetic**,
generated deterministically from a recorded seed. KestrelGrid AI does not exist. Nothing here
represents the systems, policies, controls, contracts, audit procedures or conclusions of any
real company, and no real customer or company data is present.

NetSuite is referenced as the category of system this prototype is designed to sit beside.
This project is not affiliated with, endorsed by, or derived from Oracle NetSuite, and the
NetSuite records in the dataset are generated.

---

## Repository guide

`CANONICAL_SPEC.md` is the compressed source of truth. `docs/00`–`docs/16` expand it,
`prompts/design/` and `prompts/code/` are the staged build prompts that produced this
implementation, `golden/baseline.json` holds the locked aggregates, and `CHANGELOG.md` records
the NetSuite v1.1 architectural amendment. `SESSION_HANDOFF.md` carries the working state and
the decisions a future contributor must not re-litigate.
