# Claude Code Stage 04 — Services, Evidence, Workflows, Permissions, Audit Trail

Read `docs/09_AI_BEHAVIOR_AND_GUARDRAILS.md`, `docs/10_PBC_AND_AUDIT_PACKAGE.md`, `docs/15_SECURITY_PERMISSIONS_AND_AUDIT_TRAIL.md`, and `docs/16_RULE_REGISTRY_AND_DETERMINISM.md`.

## Goal

Expose the deterministic core through typed application services and implement controlled evidence/workflow/security behavior before UI and AI rely on it.

## Implement

- query services for close readiness, blockers, exceptions, inventory items, Financial Life, counts, reconciliation, procurement matches, commercial chains, evidence, PBC status, source health
- command services for allowed demo workflows, evidence submission/review, comments, draft creation, review requests, demo reset
- Evidence / EvidenceLink with SUPPORTS, CONFLICTS_WITH, REQUIRED_FOR, CORROBORATES
- source lineage and original/normalized values
- SHA-256 evidence/source fingerprints where specified
- source sync / source health records and fail-visible coverage behavior
- workflow state machines and state history
- users, roles, explicit permissions, object-level authorization
- restricted contract access
- segregation of duties / self-approval prevention
- period lock/reopen with reasons and audit events
- append-only material audit trail
- PBC model/version dependencies sufficient for later UI
- NetSuite adapter interface that is read-only; no production mutation methods

## Tests

- unauthorized query/command denied
- self-approval denied
- restricted contract content withheld correctly
- period lock blocks ordinary mutation
- reopen requires authorized role + reason
- NetSuite source fixtures unchanged after application commands
- failed/stale required source cannot create a false PASS
- exception -> rule execution -> evidence -> source traversal works

## Do not

- build live LLM yet
- add hidden client-only permission logic
- mutate NetSuite records

Report service APIs created, security tests, audit behavior, and readiness for Stage 05.
