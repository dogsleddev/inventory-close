# 16 — Rule Registry and Determinism

Given the same dataset/source snapshots, rule versions, policy, configuration and scenario events, the same structured population, count variances, cutoff flags, match states, exceptions, blockers, reconciliation, adjustments, Close Readiness and PBC Readiness must result.

RuleDefinition has stable rule ID/version, control domain, effective dates, schemas, default assertions/risk and code/doc references. RuleExecution records run, input/output hashes, coverage, result, related objects and versions.

Canonical rule results: PASS, FAIL, REVIEW_REQUIRED, INCOMPLETE, NOT_APPLICABLE. Coverage is COMPLETE/PARTIAL/INCOMPLETE and is separate from result. Required missing evidence must never silently become PASS.

Rule families include population/count/cutoff/GIT/ownership/third-party/valuation/RMA/data-quality/reconciliation/GL/procurement/O2C. Core IDs are listed in `CANONICAL_SPEC.md`.

Money uses integer cents. Readiness uses explicit integer precision (8142 basis points = 81.42%). Source health and PBC readiness are deterministic. Transaction-chain completeness is component coverage, never accounting confidence.

Version rules, policy, config, dataset, ruleset and scenario script. Historical runs retain original versions. `RunManifest` supports `Reproduce Close`; structured replay returns MATCH/MISMATCH. AI prose is excluded from financial replay equivalence. `Reset Demo` rebuilds from source facts/rules/scenario events; it never hard-codes 7 blockers or other final metrics.

If AI disappears, the close still works. If the UI changes, the numbers remain the same. If a rule changes, the version changes. If evidence is missing, the system says so.
