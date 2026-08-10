import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_USERS, userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createCommandService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/**
 * Stage 07 — PBC versions, immutability, and auditor scope.
 *
 * The version model is what makes "provided" meaningful: it is a sealed
 * artifact with a hash, not a status word. These tests pin that a sealed
 * version is never editable, that scope follows sealed versions rather than
 * the current status label, and that the auditor stays read-only.
 */

let ws: Workspace;
let queries: ReturnType<typeof createQueryService>;
let commands: ReturnType<typeof createCommandService>;

const ctx = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-07-${role}`,
  sourceInterface: "TEST",
});

beforeEach(() => {
  ws = createWorkspace();
  queries = createQueryService(ws);
  commands = createCommandService(ws);
});

describe("PBC version history", () => {
  it("gives every provided workpaper a sealed, hashed version", () => {
    for (const item of queries.getPbcPackage(ctx("CONTROLLER"))) {
      if (item.baselineStatus !== "PROVIDED") continue;
      const sealed = item.versions.filter((v) => v.sealed);
      expect(sealed.length, `${item.id} has no sealed version`).toBeGreaterThan(0);
      for (const v of sealed) {
        expect(v.contentHash, `${item.id} v${v.version} has no hash`).toBeTruthy();
        expect(v.editable).toBe(false);
      }
    }
  });

  it("keeps a follow-up request's prior versions sealed and superseded", () => {
    const outbound = queries
      .getPbcPackage(ctx("CONTROLLER"))
      .find((i) => i.id === "PBC-008");
    expect(outbound?.baselineStatus).toBe("FOLLOW_UP_REQUESTED");
    const versions = outbound?.versions ?? [];
    // A working draft plus two provided versions, the first superseded.
    expect(versions.filter((v) => v.state === "PROVIDED")).toHaveLength(1);
    expect(versions.filter((v) => v.state === "SUPERSEDED")).toHaveLength(1);
    expect(
      versions.find((v) => v.state === "SUPERSEDED")?.supersededByVersion,
    ).toBe(2);
    // Exactly one editable object exists, and it is not a sealed version.
    const editable = versions.filter((v) => v.editable);
    expect(editable).toHaveLength(1);
    expect(editable[0]?.sealed).toBe(false);
    expect(outbound?.immutable).toBe(true);
  });

  it("never marks a draft sealed or a sealed version editable", () => {
    for (const item of queries.getPbcPackage(ctx("CONTROLLER"))) {
      for (const v of item.versions) {
        expect(v.sealed && v.editable).toBe(false);
        if (v.state === "DRAFT") expect(v.sealed).toBe(false);
        if (v.sealed) expect(v.contentHash).toBeTruthy();
        else expect(v.contentHash).toBeUndefined();
      }
    }
  });

  it("seals a version against the controlled state, so hashes reproduce", () => {
    const first = queries.getPbcPackage(ctx("CONTROLLER"));
    const second = createQueryService(createWorkspace()).getPbcPackage(
      ctx("CONTROLLER"),
    );
    const hashes = (pkg: typeof first) =>
      pkg.flatMap((i) => i.versions.map((v) => `${i.id}:${v.label}:${v.contentHash ?? ""}`));
    expect(hashes(second)).toEqual(hashes(first));
  });

  it("reports a refresh without erasing what the workpaper was prepared as", () => {
    ws.pbcPreparedState.set("PBC-001", "stale-hash");
    const item = queries.getPbcPackage(ctx("CONTROLLER")).find((i) => i.id === "PBC-001");
    expect(item?.status).toBe("REFRESH_REQUIRED");
    expect(item?.baselineStatus).toBe("PROVIDED");
    expect(item?.refreshRequired).toBe(true);
    // The already-provided version is still sealed and still immutable.
    expect(item?.immutable).toBe(true);
  });

  it("names the open exceptions a workpaper is waiting on", () => {
    const pkg = queries.getPbcPackage(ctx("CONTROLLER"));
    const attention = pkg.filter(
      (i) => i.baselineStatus !== "READY" && i.baselineStatus !== "PROVIDED",
    );
    expect(attention.map((i) => i.id)).toEqual([
      "PBC-002",
      "PBC-005",
      "PBC-008",
      "PBC-018",
    ]);
    // Each is held by close state, not by preparation effort.
    for (const item of attention) {
      expect(item.blockedBy.length, `${item.id} has no open dependency`).toBeGreaterThan(0);
    }
  });
});

describe("auditor scope follows sealed versions", () => {
  it("scopes lineage to workpapers that have actually been provided", () => {
    const auditor = ctx("AUDITOR_READ_ONLY");
    const pkg = queries.getPbcPackage(ctx("CONTROLLER"));
    const providedExceptions = new Set(
      pkg
        .filter((i) => i.hasProvidedVersion)
        .flatMap((i) => i.dependsOn.filter((d) => d.startsWith("EXC-"))),
    );
    expect(providedExceptions.size).toBeGreaterThan(0);
    for (const exc of ws.close.exceptions) {
      const visible = queries.traceLineage(auditor, exc.id) !== undefined;
      expect(visible, `${exc.id} scope mismatch`).toBe(providedExceptions.has(exc.id));
    }
  });

  it("keeps the auditor read-only on every stage-07 surface", () => {
    const auditor = ctx("AUDITOR_READ_ONLY");
    // Reads succeed…
    expect(queries.getAdjustmentRegister(auditor).identifiedCount).toBeGreaterThan(0);
    expect(queries.getValuation(auditor).reserve.conclusion).toBe("UNDETERMINED");
    expect(queries.getPbcPackage(auditor)).toHaveLength(21);
    // …and there is no write of any kind available to them.
    expect(() =>
      commands.submitEvidence(auditor, {
        title: "x",
        kind: "NOTE",
        content: {},
        relatedObjectRef: "EXC-001",
      }),
    ).toThrow();
    expect(() => commands.addComment(auditor, "EXC-001", "hi")).toThrow();
  });

  it("exposes no posting command to anyone, in any role", () => {
    const names = Object.keys(commands);
    expect(names.some((n) => /post|writeToNetsuite|approveAdjustment/i.test(n))).toBe(
      false,
    );
    for (const user of DEMO_USERS) {
      const register = (() => {
        try {
          return createQueryService(ws).getAdjustmentRegister({
            user,
            correlationId: "T-07",
            sourceInterface: "TEST",
          });
        } catch {
          return undefined;
        }
      })();
      if (register === undefined) continue;
      expect(register.postedCount).toBe(0);
    }
  });
});
