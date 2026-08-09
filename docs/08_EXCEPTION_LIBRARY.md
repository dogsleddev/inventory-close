# 08 — Exception Library

The 15 designed accounting exceptions must be generated from source facts and deterministic rules, never manually seeded as authoritative outcomes.

| ID | Rule | Exposure | Risk | Baseline | Blocker |
|---|---|---:|---|---|---|
| EXC-001 | CUT-OUT-001 | $14,800 | High | Waiting on Contract | Yes |
| EXC-002 | CUT-IN-001 | $27,600 | High | Accounting Review | Yes |
| EXC-003 | CNT-EX-001 | $9,200 | High | Recount Required | Yes |
| EXC-004 | CNT-COMP-001 | $9,200 | High | Accounting Review | Yes |
| EXC-005 | CNT-VAR-001 | $2,900 | Medium | Resolved — No Adjustment | No |
| EXC-006 | CNT-MOVE-001 | $7,400 | Medium | Resolved — No Adjustment | No |
| EXC-007 | TPI-CONF-001 | $92,400 | High | Waiting on Third Party | Yes |
| EXC-008 | OWN-LOAN-001 | $12,800 | Medium | Resolved — No Adjustment | No |
| EXC-009 | RMA-DUP-001 | $2,900 | Medium | Resolved — Adjustment Proposed | No |
| EXC-010 | DEMO-AGE-001 | $9,200 | Medium | Resolved — No Adjustment | No |
| EXC-011 | VAL-EO-001 | $27,000 | High | Accounting Review | Yes |
| EXC-012 | VAL-DMG-001 | $4,900 | Medium | Resolved — No Adjustment | No |
| EXC-013 | DQ-LOC-001 | $7,400 | Low | Resolved — No Adjustment | No |
| EXC-014 | REC-GL-001 | $9,200 | Medium | Resolved — Adjustment Proposed | No |
| EXC-015 | GL-MAN-001 | $18,750 | Critical | Controller Review | Yes |

Every exception detail includes source facts, rule/version, reason codes, assertions, evidence requirements/relationships, data-quality conditions, initial and baseline state, scenario-event transitions, blocker criteria, owner/reviewer, exposure, proposed JE if applicable, Why Flagged text, Ask Gaurd structured facts, golden-test expected output, resolution path, and prohibited AI actions.

EXC-001 must show SO-26184, IF-261972, carrier delivery 12/29, install/online 12/30, INV-2027-00418 1/2/2027, NetSuite warehouse at 12/31, and required contract provision missing. EXC-002 must show PO/vendor bill present, item receipt absent at YE, shipment in transit, ownership unresolved. EXC-003 is KE-X1-3498. EXC-004 is KE-X1-8842. EXC-007 Redwood = 14 units/$92,400. EXC-011 reserve stays undetermined. EXC-015 proposed effect is -$18,750.

Golden aggregate: 15 exceptions; 7 open; 8 resolved; 7 blockers; $198,950 blocker exposure; $255,650 designed exposure.
