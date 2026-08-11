import { describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import {
  EvidenceIncompleteError,
  createCommandService,
  createQueryService,
  createWorkspace,
  effectiveClose,
  unmetRequirements,
} from "../src/index.js";
import { AuthorizationError } from "@icg/permissions";

/**
 * The close loop: request evidence → submit it → conclude → the blocker
 * clears → sign-off becomes reachable.
 *
 * The rule these tests exist to protect (COMPLETION_PLAN decision D6): a
 * management conclusion may NOT resolve an exception whose rule still has a
 * required record missing. Management concludes; it does not conclude the
 * evidence into existence.
 */

function setup() {
  const ws = createWorkspace();
  const queries = createQueryService(ws);
  const commands = createCommandService(ws);
  const ctx = (role: Parameters<typeof userByRole>[0]) => ({
    user: userByRole(role),
    correlationId: "T-VERBS",
    sourceInterface: "TEST",
  });
  return { ws, queries, commands, ctx };
}

/** Walk one exception all the way through the loop. */
function resolve(
  t: ReturnType<typeof setup>,
  exceptionId: string,
  role: Parameters<typeof userByRole>[0] = "CONTROLLER",
) {
  for (const requirement of unmetRequirements(t.ws, exceptionId)) {
    t.commands.submitEvidence(t.ctx(role), {
      title: `Support for ${requirement}`,
      kind: "MANAGEMENT_SUPPORT",
      content: { requirement },
      relatedObjectRef: exceptionId,
      satisfiesRequirement: { exceptionId, requirement },
    });
  }
  return t.commands.concludeException(t.ctx(role), {
    exceptionId,
    conclusion: "RESOLVED_NO_ADJUSTMENT",
    rationale: "Support obtained and reviewed; no adjustment required.",
  });
}

describe("a conclusion cannot outrun the evidence", () => {
  it("refuses to resolve an exception whose required record is missing", () => {
    const t = setup();
    expect(unmetRequirements(t.ws, "EXC-001").length).toBeGreaterThan(0);
    expect(() =>
      t.commands.concludeException(t.ctx("CONTROLLER"), {
        exceptionId: "EXC-001",
        conclusion: "RESOLVED_NO_ADJUSTMENT",
        rationale: "Looks fine to me.",
      }),
    ).toThrow(EvidenceIncompleteError);
    // And the refusal names what is needed rather than only refusing.
    try {
      t.commands.concludeException(t.ctx("CONTROLLER"), {
        exceptionId: "EXC-001",
        conclusion: "RESOLVED_NO_ADJUSTMENT",
        rationale: "Looks fine to me.",
      });
    } catch (error) {
      expect((error as EvidenceIncompleteError).unmet.join(" ")).toContain("Ownership");
    }
  });

  it("allows REMAINS_OPEN with the evidence still missing — that is a real conclusion", () => {
    const t = setup();
    const record = t.commands.concludeException(t.ctx("CONTROLLER"), {
      exceptionId: "EXC-001",
      conclusion: "REMAINS_OPEN",
      rationale: "Legal is retrieving the executed agreement; stays open at year-end.",
    });
    expect(record.conclusion).toBe("REMAINS_OPEN");
    // Recording that it stays open must NOT clear the blocker.
    expect(effectiveClose(t.ws).blockerCount).toBe(t.ws.close.blockers.length);
  });

  it("requires a rationale", () => {
    const t = setup();
    expect(() =>
      t.commands.concludeException(t.ctx("CONTROLLER"), {
        exceptionId: "EXC-003",
        conclusion: "REMAINS_OPEN",
        rationale: "   ",
      }),
    ).toThrow(/rationale/i);
  });

  it("counts only evidence submitted AGAINST the requirement it names", () => {
    const t = setup();
    const before = unmetRequirements(t.ws, "EXC-001").length;
    // An unrelated submission must not satisfy anything.
    t.commands.submitEvidence(t.ctx("CONTROLLER"), {
      title: "Some other document",
      kind: "MANAGEMENT_SUPPORT",
      content: { note: "unrelated" },
      relatedObjectRef: "EXC-001",
    });
    expect(unmetRequirements(t.ws, "EXC-001")).toHaveLength(before);
  });

  it("does not let returned evidence satisfy a requirement", () => {
    const t = setup();
    const requirement = unmetRequirements(t.ws, "EXC-001")[0] as string;
    const item = t.commands.submitEvidence(t.ctx("PREPARER"), {
      title: "Draft provision",
      kind: "CONTRACT",
      content: { requirement },
      relatedObjectRef: "EXC-001",
      satisfiesRequirement: { exceptionId: "EXC-001", requirement },
    });
    expect(unmetRequirements(t.ws, "EXC-001")).not.toContain(requirement);
    t.commands.reviewEvidence(t.ctx("CONTROLLER"), item.id, "RETURNED", "Wrong agreement.");
    // Sent back means it never answered the question.
    expect(unmetRequirements(t.ws, "EXC-001")).toContain(requirement);
  });
});

describe("the loop closes", () => {
  it("clears a blocker once its evidence is in and management concludes", () => {
    const t = setup();
    const baseline = effectiveClose(t.ws);
    resolve(t, "EXC-001");
    const after = effectiveClose(t.ws);
    expect(after.blockerCount).toBe(baseline.blockerCount - 1);
    expect(after.blockerExposureCents).toBeLessThan(baseline.blockerExposureCents);
    expect(after.diverged).toBe(true);
    // The rules' own baseline is untouched and still reportable.
    expect(after.baselineBlockerCount).toBe(baseline.blockerCount);
    expect(after.baselineReadinessBps).toBe(baseline.readinessBps);
  });

  it("reaches zero blockers and a higher readiness when every blocker is concluded", () => {
    const t = setup();
    const baseline = effectiveClose(t.ws);
    for (const blocker of t.ws.close.blockers) resolve(t, blocker.exceptionId);
    const after = effectiveClose(t.ws);
    expect(after.blockerCount).toBe(0);
    expect(after.blockerExposureCents).toBe(0);
    expect(after.readinessBps).toBeGreaterThan(baseline.readinessBps);
  });

  it("lets the period lock only after the blockers are gone", () => {
    const t = setup();
    for (const blocker of t.ws.close.blockers) resolve(t, blocker.exceptionId);
    expect(effectiveClose(t.ws).blockerCount).toBe(0);
    expect(t.commands.lockPeriod(t.ctx("CONTROLLER"), "LOCKED")).toBe("LOCKED");
    // And a locked period refuses further conclusions.
    expect(() =>
      t.commands.concludeException(t.ctx("CONTROLLER"), {
        exceptionId: "EXC-002",
        conclusion: "REMAINS_OPEN",
        rationale: "late",
      }),
    ).toThrow(/locked/i);
  });

  it("records an evidence request without it becoming evidence", () => {
    const t = setup();
    const requirement = unmetRequirements(t.ws, "EXC-007")[0] as string;
    t.commands.requestEvidence(t.ctx("CONTROLLER"), {
      exceptionId: "EXC-007",
      requirement,
      askedOf: "Supply Chain",
    });
    // Asking changes nothing about what is still missing.
    expect(unmetRequirements(t.ws, "EXC-007")).toContain(requirement);
    const workflow = t.queries.getExceptionWorkflow(t.ctx("CONTROLLER"), "EXC-007");
    expect(workflow.requests).toHaveLength(1);
    expect(workflow.canResolve).toBe(false);
  });
});

describe("who may do what", () => {
  it("refuses a conclusion from a role without the authority", () => {
    const t = setup();
    for (const role of ["PREPARER", "WAREHOUSE", "AUDITOR_READ_ONLY", "SYSTEM_ADMIN"] as const) {
      expect(() =>
        t.commands.concludeException(t.ctx(role), {
          exceptionId: "EXC-003",
          conclusion: "REMAINS_OPEN",
          rationale: "no",
        }),
        role,
      ).toThrow(AuthorizationError);
    }
  });

  it("offers exactly what it allows", () => {
    const t = setup();
    for (const role of ["CONTROLLER", "ACCOUNTING_MANAGER", "PREPARER", "AUDITOR_READ_ONLY"] as const) {
      const caps = t.queries.getDemoCapabilities(t.ctx(role));
      if (!caps.canConclude) {
        expect(() =>
          t.commands.concludeException(t.ctx(role), {
            exceptionId: "EXC-003",
            conclusion: "REMAINS_OPEN",
            rationale: "x",
          }),
          role,
        ).toThrow(AuthorizationError);
      }
    }
  });
});

describe("the baseline survives", () => {
  it("restores every locked figure on reset, after a full session of work", () => {
    const t = setup();
    const baseline = effectiveClose(t.ws);
    for (const blocker of t.ws.close.blockers) resolve(t, blocker.exceptionId);
    t.commands.requestEvidence(t.ctx("CONTROLLER"), {
      exceptionId: "EXC-002",
      requirement: "anything",
      askedOf: "Supply Chain",
    });
    expect(effectiveClose(t.ws).blockerCount).toBe(0);

    t.commands.resetDemo(t.ctx("CONTROLLER"));

    const after = effectiveClose(t.ws);
    expect(after.blockerCount).toBe(baseline.blockerCount);
    expect(after.blockerExposureCents).toBe(baseline.blockerExposureCents);
    expect(after.readinessBps).toBe(baseline.readinessBps);
    expect(after.diverged).toBe(false);
    expect(t.ws.conclusions).toHaveLength(0);
    expect(t.ws.evidenceRequests).toHaveLength(0);
    // The append-only trail survives the reset — that is the point of it.
    expect(t.ws.audit.count()).toBeGreaterThan(0);
  });

  it("never writes a conclusion into the derived close", () => {
    const t = setup();
    const before = JSON.stringify(t.ws.close.exceptions);
    resolve(t, "EXC-003");
    expect(JSON.stringify(t.ws.close.exceptions)).toBe(before);
  });
});
