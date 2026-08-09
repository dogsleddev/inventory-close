# Claude Design Prompt 02 — Overview and Sign-Off Experience

Continue from the approved shell/design system. Read `docs/11_UX_AND_INFORMATION_ARCHITECTURE.md` and `docs/12_DEMO_FLOW.md` again before designing.

## Objective

Design the strongest Controller landing page in the product. A first-time finance leader must understand the situation in 10–30 seconds.

The Overview is not a reporting dashboard. It is a **decision surface for close sign-off**.

## Exact hero facts

Display:

- FY2026 Inventory Close
- 81.4% Close Ready
- 7 active blockers
- $198,950 blocker exposure
- Gross subledger $4.80M
- Gross GL $4.812M
- Current GL difference $12,450
- PBC Readiness 80.95%
- Data Health 91.67%

## Most important component: Preventing Sign-Off

This is the dominant panel.

Show at least the highest-value/highest-risk items:

- EXC-007 · Third-party confirmation · Redwood Installation Services · $92,400 · Waiting on Third Party
- EXC-002 · Inbound goods in transit · $27,600 · Accounting Review
- EXC-011 · Slow-moving / E&O · $27,000 · Accounting Review
- EXC-015 · Unsupported manual inventory GL entry · $18,750 · Critical · Controller Review
- EXC-001 · Customer deployment / missing contract · $14,800 · Waiting on Contract

Provide a clear `View all 7 blockers` action.

Each row/card should communicate:

- issue
- exposure
- risk
- owner
- status
- age / freshness if useful
- next action

Do not make this a simple alert feed.

## Close areas

Create a compact readiness/control matrix using:

- Population / GL — 90%
- Physical Count — 90%
- Cutoff — 80%
- Ownership — 85%
- Third Party — 80%
- Valuation — 85%
- Exceptions — 53.33%
- Adjustments — 66.67%

Use short contextual attention notes instead of eight decorative charts.

Examples:

- Population / GL — `$12,450 current difference`
- Physical Count — `2 open count issues`
- Third Party — `$92.4K awaiting support`
- Exceptions — `7 open blockers`

## Needs Attention

Create a role-aware Controller attention panel with representative items such as:

- Review JE-003
- Review E&O analysis
- Obtain/review contract for EXC-001
- Resolve inbound GIT conclusion

These are actions, not notifications.

## Recent meaningful changes

Use a small activity section that surfaces material workflow events, not raw system logs.

Examples:

- EXC-014 resolved with proposed adjustment
- Loaner agreement added to EXC-008
- PBC-008 follow-up requested

## Data & control health

Compactly show:

- NetSuite ERP — Healthy
- NetSuite WMS — Healthy
- FlightPath — Healthy
- DeployOps — Healthy
- Device Cloud — Healthy
- AccordVault — Stale
- ReturnLoop — Partial
- Kestrel CRM — Healthy
- Forecast Platform — Healthy

Make the stale contract source meaningful because it affects cutoff/ownership coverage.

## Primary demo CTA

Include a natural action that opens EXC-001, such as:

`Review highest-risk cutoff item`

or another wording consistent with the design system.

## Acceptance

At a glance, the page must answer:

1. Are we ready?
2. What blocks sign-off?
3. How much exposure remains?
4. Does inventory tie to the GL?
5. What requires my attention next?

If any of those require scrolling through decorative content, redesign.
