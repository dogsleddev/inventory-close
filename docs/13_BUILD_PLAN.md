# 13 — Build Plan

Build order: DATA → SCHEMAS → DOMAIN → RULES → TESTS → SERVICES → WORKFLOWS → UI → AI → POLISH.

Hard gate: do not build the main dashboard until all 15 golden accounting scenarios and aggregate controls pass.

P0: deterministic dataset, core model, rules, golden tests, population/count/cutoff/ownership/valuation/reconciliation/blockers/readiness, evidence lineage, Overview, Exceptions, Physical Count, Cutoff, Reconciliation, Adjustments, Reset Demo.

P1: Financial Life, three-layer reality, transaction chain, cycle-count history, procurement match, commercial chain, Ask Gaurd, PBC package, deterministic fallback.

P2: replay UI, deep audit provenance, assumptions/user guide, auditor read-only polish, export refinements, future MCP.

NetSuite is read-only. No service for posting JEs, approving counts, editing bills/invoices/fulfillments, or changing inventory exists in MVP.

Claude Code workstreams: types/schemas; dataset; rules/golden tests; repositories/services; evidence/workflows; core UI; Financial Life/NetSuite chains; PBC; Ask Gaurd; QA/polish. Each reports files changed, tests, incomplete items, deviations and new assumptions.
