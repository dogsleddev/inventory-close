# Claude Design Prompt 01 — App Shell and Design System

Continue from `00_CLAUDE_DESIGN_MASTER_BRIEF.md`. Reuse the established visual language. Do not alter product facts or architecture.

## Objective

Turn the master direction into a high-fidelity desktop application shell that can support information-dense Controller workflows without feeling like a traditional ERP.

## Design these elements

### 1. Left navigation

Include:

- Overview
- Inventory
- Physical Count
- Cutoff
- Ownership
- Valuation
- Exceptions
- Evidence
- Reconciliation
- Adjustments
- Audit Package
- Assumptions
- User Guide

Support clear active state, compact icons where helpful, and a subtle `START HERE` treatment on User Guide for a first-time visitor without making it dominant.

### 2. Global header

Show representative:

- KestrelGrid AI
- FY2026 Inventory Close
- Dec. 31, 2026
- Synthetic Demo indicator
- optional compact Close Readiness / blocker context
- data health access
- Demo Role selector
- Ask Gaurd control

Avoid turning the global header into a KPI strip.

### 3. Content hierarchy

Define reusable patterns for:

- page title + period/context
- key financial status row
- primary attention panel
- secondary support panels
- tables
- split evidence comparison
- timelines
- right-side details drawer

### 4. Status system

Design consistent treatments for:

- Open
- Waiting on Contract
- Waiting on Third Party
- Accounting Review
- Recount Required
- Controller Review
- Resolved — No Adjustment
- Resolved — Adjustment Proposed
- Ready
- Provided
- Preparing
- Follow-Up Requested
- Not Started
- Healthy
- Partial
- Stale
- Failed

Status must remain readable without color.

### 5. Risk system

Design restrained Critical / High / Medium / Low presentation. Do not let risk styling overpower blocker status or next action.

### 6. Source chips

Create a consistent pattern for source records, especially:

- NetSuite · Item Fulfillment · IF-261972
- FlightPath · Carrier Event
- DeployOps · Installation
- Device Cloud · Telemetry
- AccordVault · Contract

The chip should communicate source + record type + identifier, and be clickable to evidence detail.

### 7. Audit Details

Create a reusable expandable drawer/panel that can contain:

- object ID
- rule ID/version
- dataset version
- run ID
- evidence IDs
- source IDs
- timestamps
- hashes
- review history

This should be accessible but visually secondary.

### 8. Ask Gaurd shell

Collapsed state should be subtle but persistent.

Expanded state should include:

- current object context
- suggested prompts
- answer area
- evidence/source chips
- action/navigation links

It must look like a controlled product assistant, not a consumer chat app.

### 9. Loading / empty / unavailable states

Explicitly distinguish:

- Loading
- Zero
- No records
- Data unavailable
- Access restricted
- Source stale
- AI explanation unavailable

## Representative shell screen

Use the Overview baseline:

- 81.4% Close Ready
- 7 blockers
- $198,950 exposure
- $12,450 GL difference
- 80.95% PBC readiness
- 91.67% Data Health

The purpose is to prove the shell can carry real financial information cleanly.

## Design review checklist

Before finishing, verify:

- no generic AI-dashboard aesthetic
- no giant gauges
- no fake audit-approval signals
- dense tables remain readable
- exact baseline facts retained
- the product looks coherent enough that all later screens can reuse it
