import { describe, expect, it } from "vitest";
import { CANONICAL_DATASET_VERSION } from "@icg/domain";
import { userByRole } from "@icg/data";
import { AuthorizationError } from "@icg/permissions";
import { createQueryService, createWorkspace } from "../src/index.js";
import type { ServiceContext } from "../src/index.js";

/**
 * Stage 05 additive queries: read-only views the UI shell needs (period
 * state, run provenance, rule executions, scenario-event activity). They
 * carry the same authorization gate as every other close read.
 */

const ws = createWorkspace();
const queries = createQueryService(ws);

const ctx = (role: Parameters<typeof userByRole>[0]): ServiceContext => ({
  user: userByRole(role),
  correlationId: "T-STAGE05",
  sourceInterface: "TEST",
});

describe("stage 05 shell queries", () => {
  it("serves the open period state to a close reader", () => {
    expect(queries.getPeriod(ctx("CONTROLLER")).state).toBe("OPEN");
  });

  it("serves run provenance with the canonical dataset version", () => {
    const manifest = queries.getRunManifest(ctx("CONTROLLER"));
    expect(manifest.datasetVersion).toBe(CANONICAL_DATASET_VERSION);
    // The workspace is deterministic, so the run identity is pinnable.
    expect(manifest.runId).toMatch(/^RUN-[0-9a-f]{12}-BASELINE$/);
    expect(manifest.outputHash).toMatch(/^[0-9a-f]{16,64}$/);
  });

  it("serves rule executions including the EXC-001 cutoff rule", () => {
    const executions = queries.getRuleExecutions(ctx("CONTROLLER"));
    const cutOut = executions.find((e) => String(e.ruleId) === "CUT-OUT-001");
    expect(cutOut).toBeDefined();
    expect(cutOut?.result).toBe("REVIEW_REQUIRED");
    // Coverage is COMPLETE: the contract document itself was retrievable;
    // the missing provision is a finding inside it, not a coverage gap.
    // (The design mockup's "Coverage INCOMPLETE" copy was fiction — the UI
    // renders this execution record, never that copy.)
    expect(cutOut?.coverage).toBe("COMPLETE");
  });

  it("serves scenario events ordered by seq", () => {
    const events = queries.getScenarioEvents(ctx("CONTROLLER"));
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((e) => e.seq)).toEqual(
      [...events.map((e) => e.seq)].sort((a, b) => a - b),
    );
    // The events must reference the fixture script, not invented activity.
    for (const e of events) expect(e.script).toBe("SCENARIO-EVENTS-v1.1.0");
  });

  it("denies all four to a role without close.read (system admin)", () => {
    const admin = ctx("SYSTEM_ADMIN");
    // Typed, so an incidental crash elsewhere cannot masquerade as the gate.
    expect(() => queries.getPeriod(admin)).toThrowError(AuthorizationError);
    expect(() => queries.getRunManifest(admin)).toThrowError(AuthorizationError);
    expect(() => queries.getRuleExecutions(admin)).toThrowError(AuthorizationError);
    expect(() => queries.getScenarioEvents(admin)).toThrowError(AuthorizationError);
  });
});
