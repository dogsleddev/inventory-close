import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import {
  createCommandService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/** Regression pins for the Stage 04 adversarial-fleet findings. */

const ctx = (role: Parameters<typeof userByRole>[0], n = 1): ServiceContext => ({
  user: userByRole(role),
  correlationId: `CORR-F${n}`,
  sourceInterface: "TEST",
});

let ws: Workspace;
let queries: ReturnType<typeof createQueryService>;
let commands: ReturnType<typeof createCommandService>;

beforeEach(() => {
  ws = createWorkspace();
  queries = createQueryService(ws);
  commands = createCommandService(ws);
});

describe("submitted-evidence redaction (commands are not a side door)", () => {
  it("annotateEvidence withholds restricted content from non-privileged roles", () => {
    const legal = ctx("LEGAL");
    const item = commands.submitEvidence(legal, {
      title: "Bluewater ownership rider draft",
      kind: "CONTRACT_EXTRACT",
      content: { clause: "Title transfers upon written acceptance" },
      sensitivity: "RESTRICTED",
      relatedObjectRef: "EXC-001",
    });
    const annotated = commands.annotateEvidence(ctx("WAREHOUSE"), item.id, "seen on dock");
    expect(annotated.content).toBeUndefined();
    expect(annotated.contentHash.length).toBe(64);
    expect(annotated.annotations).toHaveLength(1);
    // The stored item keeps full content for privileged readers.
    const reviewed = commands.reviewEvidence(ctx("CONTROLLER"), item.id, "ACCEPTED");
    expect(reviewed.content).toBeDefined();
  });
});

describe("evidence review is one-shot with a truthful audit trail", () => {
  it("rejects re-review and records the real prior state", () => {
    const preparer = ctx("PREPARER");
    const item = commands.submitEvidence(preparer, {
      title: "Recount photo", kind: "PHOTO", content: { bin: "PRI-04" },
      relatedObjectRef: "EXC-005",
    });
    commands.reviewEvidence(ctx("CONTROLLER"), item.id, "ACCEPTED");
    expect(() =>
      commands.reviewEvidence(ctx("ACCOUNTING_MANAGER"), item.id, "RETURNED"),
    ).toThrow(/already reviewed \(ACCEPTED\)/);
    const event = ws.audit.listForObject(item.id).find((e) => e.action === "EVIDENCE_REVIEWED");
    expect(event?.priorState).toBe("PENDING");
    expect(event?.newState).toBe("ACCEPTED");
    // Only one review event exists — the rejected attempt never audited a flip.
    expect(
      ws.audit.listForObject(item.id).filter((e) => e.action === "EVIDENCE_REVIEWED"),
    ).toHaveLength(1);
  });
});

describe("auditor sees only provided/permitted support", () => {
  it("scopes evidence, links, and lineage to provided workpapers", () => {
    const auditor = ctx("AUDITOR_READ_ONLY");
    const controllerAll = queries.listEvidence(ctx("CONTROLLER"));
    const auditorVisible = queries.listEvidence(auditor);
    expect(auditorVisible.length).toBeGreaterThan(0);
    expect(auditorVisible.length).toBeLessThan(controllerAll.length);
    // EXC-001's workpaper is PBC-008 Outbound Cutoff. Stage 07 corrected the
    // baseline to the specified one: PBC-008 is FOLLOW_UP_REQUESTED, which
    // means support was already provided and the auditor asked for more —
    // its sealed versions are in their hands, so the lineage is in scope.
    expect(queries.traceLineage(auditor, "EXC-001")).toBeDefined();
    // EXC-009 sits under PBC-002, which is Preparing at the baseline — no
    // version of it has ever been provided, so it is NOT in auditor scope.
    expect(queries.traceLineage(auditor, "EXC-009")).toBeUndefined();
    expect(queries.traceLineage(ctx("CONTROLLER"), "EXC-009")).toBeDefined();
    // Scope is not a content gate: restricted contract content stays
    // withheld from the auditor even inside an in-scope lineage.
    const lineage = queries.traceLineage(auditor, "EXC-001");
    for (const { item } of lineage?.evidence ?? []) {
      if (item.sensitivity === "RESTRICTED") expect(item.content).toBeUndefined();
    }
    // The management cycle-count lens is never auditor-facing.
    expect(queries.getCountDetail(auditor).managementIndicators).toHaveLength(0);
    expect(
      queries.getCountDetail(ctx("CONTROLLER")).managementIndicators.length,
    ).toBeGreaterThan(0);
  });
});

describe("evidence graph completeness", () => {
  it.each([
    ["EXC-004", "COUNT_TEST"],
    ["EXC-005", "COUNT_RESULT"],
    ["EXC-011", "FORECAST"],
  ])("%s has lineage including %s evidence", (excId, kind) => {
    const lineage = queries.traceLineage(ctx("CONTROLLER"), excId);
    expect(lineage).toBeDefined();
    expect(lineage!.evidence.length).toBeGreaterThan(0);
    expect(lineage!.evidence.some((e) => e.item.kind === kind)).toBe(true);
  });

  it("every derived exception has at least one evidence item", () => {
    for (const exc of ws.close.exceptions) {
      const lineage = queries.traceLineage(ctx("CONTROLLER"), exc.id);
      expect(lineage?.evidence.length, `${exc.id} has no evidence`).toBeGreaterThan(0);
    }
  });

  it("carries original/normalized lineage values with matching hashes", () => {
    const lineage = queries.traceLineage(ctx("CONTROLLER"), "EXC-009");
    for (const { item } of lineage!.evidence) {
      expect(item.transformation).toBe("IDENTITY");
      expect(item.originalHash).toBe(item.contentHash);
    }
  });
});

describe("deterministic evidence identity", () => {
  it("content hashing is canonical (key order does not matter)", () => {
    const a = commands.submitEvidence(ctx("CONTROLLER"), {
      title: "a", kind: "NOTE", content: { x: 1, y: 2 }, relatedObjectRef: "EXC-002",
    });
    const b = commands.submitEvidence(ctx("CONTROLLER"), {
      title: "b", kind: "NOTE", content: { y: 2, x: 1 }, relatedObjectRef: "EXC-002",
    });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("submitted-evidence ids stay unique across demo reset", () => {
    const first = commands.submitEvidence(ctx("CONTROLLER"), {
      title: "pre-reset", kind: "NOTE", content: { n: 1 }, relatedObjectRef: "EXC-002",
    });
    commands.resetDemo(ctx("CONTROLLER"));
    const second = commands.submitEvidence(ctx("CONTROLLER"), {
      title: "post-reset", kind: "NOTE", content: { n: 2 }, relatedObjectRef: "EXC-002",
    });
    expect(second.id).not.toBe(first.id);
    // The surviving audit trail references both without ambiguity.
    const referenced = ws.audit
      .list()
      .filter((e) => e.action === "EVIDENCE_SUBMITTED")
      .map((e) => e.objectRef);
    expect(new Set(referenced).size).toBe(referenced.length);
  });
});
