# 04 — Assumptions and Open Questions

This file separates synthetic demo assumptions from facts a production implementation must discover. Status classes: CONFIRMED, PROTOTYPE ASSUMPTION, REQUIRES MANAGEMENT DECISION, ACCOUNTING POLICY, CONTRACT, OPERATIONS, LEGAL, EXTERNAL AUDITOR.

Production discovery must validate legal entities, currencies, NetSuite features/record use, inventory system of record, serialization/bins, costing, GL mappings, close calendar, physical/cycle-count methodology, movement controls, auditor interaction, inbound/outbound shipping terms, customer-site hardware models, contract hierarchy, demos/loaners/RMA, third-party/CM/3PL custody, aging/E&O methodology, reserve policy, materiality/review thresholds, PBC requirements, roles/SOD, source freshness, evidence retention, time zones, adjustments, locks/reopen, AI permissions, model/provider controls, write-back boundaries, and golden scenarios.

The public demo uses explicit synthetic assumptions. Unknown required production configuration must become `CONFIGURATION_REQUIRED`, not a guessed value.

Principles: **Visible uncertainty over hidden certainty. Configuration over guessing. Evidence over assumption.**
