# Claude Design Prompt 06 — Audit Package and Ask Gaurd

Continue the approved design system. These experiences must demonstrate auditability and AI restraint without making the product feel designed for auditors instead of management.

## Part A — Audit Package

Design the management-prepared PBC workspace.

### Exact baseline

- 21 PBC requests
- 17 Ready or Provided
- PBC Readiness 80.95%
- Provided: 5
- Ready: 12
- Preparing: 2
- Follow-Up Requested: 1
- Not Started: 1

### Requires Attention

Feature:

- PBC-002 · Inventory-to-GL Reconciliation · Preparing
- PBC-005 · Count Variance Reconciliation · Preparing
- PBC-008 · Outbound Cutoff · Follow-Up Requested
- PBC-018 · E&O Analysis · Not Started

### PBC detail

Tabs/patterns:

- Summary
- Workpaper
- Evidence
- Version History
- Related Exceptions
- Audit Details

Clearly distinguish:

- Ready
- Provided
- Follow-Up Requested
- Refresh Required

Do not use `Auditor Approved` or similar wording.

### Evidence lineage

Create an elegant lineage path such as:

`PBC-008 → EXC-001 → KE-E2-1048 → FlightPath Carrier Event`

The reviewer should be able to answer `Where did this number/fact come from?` without leaving the product context.

### Version history

Show immutable provided versions and later updates. A Provided version must never look editable in place.

## Part B — Ask Gaurd

Ask Gaurd is a right-side assistant drawer over the same deterministic services as the UI.

It may:

- Explain
- Investigate
- Draft
- Navigate

It may not:

- Decide
- approve
- post
- close controlled exceptions
- invent evidence
- invent contract terms
- select auditor samples
- invent a reserve

### Default Overview prompts

- What prevents Controller sign-off?
- Why doesn't inventory tie?
- Show largest unresolved exposures.
- Which evidence is still missing?
- Which PBC items are not ready?

### Material answer pattern

For important questions, visually structure:

- Status
- Known Facts
- Conflicting Evidence
- Missing Evidence
- Assertions
- Exposure
- Management Conclusion
- Next Action
- Evidence chips

### EXC-001 answer

Question:

`Why is KE-E2-1048 still open?`

The answer must communicate:

- Waiting on Contract
- $14,800
- shipped 12/27
- delivered 12/29
- installed / online 12/30
- NetSuite still Warehouse at 12/31
- applicable contract provision missing
- conclusion Open
- next action obtain/review contract

The visual trust moment is that Ask Gaurd **refuses to fill in the missing ownership answer**.

### AI unavailable state

Design a graceful state:

`AI explanation unavailable. Deterministic close data remains available.`

Continue to show structured status, facts, evidence, and navigation.

### Permissions

Show how Ask Gaurd respects role access. For example, a Warehouse role asking to view restricted contract terms receives an access-restricted response while still seeing that contract review is required.

## Acceptance

Ask Gaurd should feel like an investigative window into the close, not a second source of truth.
