# 15 — Security, Permissions and Audit Trail

Principle: Read broadly where appropriate; change narrowly; approve explicitly; preserve history.

Roles: Head of Finance, Controller, Accounting Manager, Preparer, Warehouse, Supply Chain, FP&A, Legal, Auditor Read-Only, System Admin. Roles map to explicit permissions; service-layer authorization is mandatory. System Admin does not automatically gain accounting authority. Preparer cannot self-approve material work.

Evidence sensitivity: STANDARD, CONFIDENTIAL, RESTRICTED. Contract contents require restricted permission; users may still be told that restricted evidence exists or that support is missing where policy allows.

Ask Gaurd inherits the authenticated user's authorization before data reaches the model. Natural-language claims cannot elevate identity or permissions.

NetSuite integration is read-only with minimum necessary scopes. Source snapshots preserve original and normalized values and hashes. Material state changes generate append-only audit events with actor, role, object, prior/new state, reason, interface and correlation ID. Prefer supersede/void/annotate to destructive edits.

Period states: OPEN, SOFT_LOCKED, LOCKED, REOPENED. Reopen requires permission, reason and retained prior lock history. Provided PBC versions are immutable. Auditor role is read-only. AI drafts are drafts, not approvals.
