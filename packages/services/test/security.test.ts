import { beforeEach, describe, expect, it } from "vitest";
import { hashObject, userByRole } from "@icg/data";
import { AuthorizationError, SegregationOfDutiesError } from "@icg/permissions";
import { InvalidTransitionError } from "@icg/workflows";
import {
  createCommandService,
  createProjectionService,
  createQueryService,
  createWorkspace,
  PeriodLockedError,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";
// Not on the package barrel: the scope predicate is internal, and this test
// asserts a projection against the very rule it implements.
import { makeRecordScope } from "../src/queries.js";

/** The eight prompt-04 security/behavior test categories. */

const ctx = (role: Parameters<typeof userByRole>[0], n = 1): ServiceContext => ({
  user: userByRole(role),
  correlationId: `CORR-${n}`,
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

describe("1. unauthorized query/command denied", () => {
  it("denies audit-trail reads to roles without audit.read", () => {
    expect(() => queries.getAuditTrail(ctx("WAREHOUSE"))).toThrow(AuthorizationError);
  });

  it("denies commands to the read-only auditor", () => {
    expect(() =>
      commands.submitEvidence(ctx("AUDITOR_READ_ONLY"), {
        title: "x", kind: "NOTE", content: {}, relatedObjectRef: "EXC-001",
      }),
    ).toThrow(AuthorizationError);
    expect(() => commands.addComment(ctx("AUDITOR_READ_ONLY"), "EXC-001", "hi")).toThrow(
      AuthorizationError,
    );
  });

  it("gives the system admin no accounting authority", () => {
    expect(() => queries.getCloseReadiness(ctx("SYSTEM_ADMIN"))).toThrow(AuthorizationError);
    expect(() => commands.lockPeriod(ctx("SYSTEM_ADMIN"), "LOCKED")).toThrow(AuthorizationError);
    // But the platform operator can read the audit trail.
    expect(() => queries.getAuditTrail(ctx("SYSTEM_ADMIN"))).not.toThrow();
  });
});

describe("2. self-approval denied", () => {
  it("a preparer cannot approve their own review", () => {
    const preparer = ctx("PREPARER");
    const review = commands.requestReview(preparer, "PBC-018");
    // The preparer lacks review.approve entirely:
    expect(() => commands.approveReview(preparer, review.id)).toThrow(AuthorizationError);
    // A reviewer who PREPARED the work is blocked by SOD even with the grant:
    const controller = ctx("CONTROLLER");
    const own = commands.requestReview(controller, "PBC-020");
    expect(() => commands.approveReview(controller, own.id)).toThrow(
      SegregationOfDutiesError,
    );
    // A different authorized approver succeeds.
    const approved = commands.approveReview(ctx("ACCOUNTING_MANAGER"), own.id);
    expect(approved.state).toBe("APPROVED");
    expect(approved.approvedByUserId).not.toBe(controller.user.id);
  });

  it("an evidence reviewer cannot accept their own submission", () => {
    const controller = ctx("CONTROLLER");
    const item = commands.submitEvidence(controller, {
      title: "Recount sheet", kind: "COUNT_SHEET", content: { qty: 19 },
      relatedObjectRef: "EXC-005",
    });
    expect(() => commands.reviewEvidence(controller, item.id, "ACCEPTED")).toThrow(
      SegregationOfDutiesError,
    );
    const reviewed = commands.reviewEvidence(ctx("ACCOUNTING_MANAGER"), item.id, "ACCEPTED");
    expect(reviewed.reviewState).toBe("ACCEPTED");
  });
});

describe("3. restricted contract content withheld correctly", () => {
  it("withholds contract content from roles without read_restricted, keeping existence visible", () => {
    const warehouseView = queries.listEvidence(ctx("WAREHOUSE"));
    const contracts = warehouseView.filter((e) => e.sensitivity === "RESTRICTED");
    expect(contracts.length).toBeGreaterThan(0);
    for (const c of contracts) {
      expect(c.contentWithheld).toBe(true);
      expect(c.content).toBeUndefined();
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.contentHash.length).toBe(64);
    }
  });

  it("legal and controller read restricted contract content", () => {
    for (const role of ["LEGAL", "CONTROLLER"] as const) {
      const view = queries.listEvidence(ctx(role));
      const contracts = view.filter((e) => e.sensitivity === "RESTRICTED");
      expect(contracts.every((c) => !c.contentWithheld && c.content !== undefined)).toBe(true);
    }
  });

  it("redacts EVERY copy of restricted content in lineage, not just `content`", () => {
    // Found by the stage-08 adversarial suite. EvidenceItem carries the
    // retrieved value twice — `content` and `originalValue` — and the
    // fixture pipeline is an IDENTITY transformation, so they are
    // byte-identical. Clearing one while spreading the other disclosed the
    // whole restricted payload to any role holding evidence.read.
    for (const role of ["WAREHOUSE", "SUPPLY_CHAIN", "FPA", "PREPARER"] as const) {
      const lineage = queries.traceLineage(ctx(role), "EXC-001");
      expect(lineage, `${role} cannot trace EXC-001`).toBeDefined();
      for (const { item } of lineage!.evidence) {
        if (item.sensitivity === "STANDARD") continue;
        expect(item.content, `${role} read ${item.id}.content`).toBeUndefined();
        expect(
          item.originalValue,
          `${role} read ${item.id}.originalValue`,
        ).toBeUndefined();
      }
      // Nothing in the serialized lineage names a contract provision.
      expect(JSON.stringify(lineage)).not.toMatch(/OWNERSHIP_TRANSFER|TITLE_RETENTION/);
    }
    // Not vacuous: a privileged role still receives both copies and the
    // hashes are preserved for everyone.
    const legal = queries.traceLineage(ctx("LEGAL"), "EXC-001");
    expect(JSON.stringify(legal)).toMatch(/OWNERSHIP_TRANSFER/);
    for (const { item } of queries.traceLineage(ctx("WAREHOUSE"), "EXC-001")!.evidence) {
      expect(item.contentHash).toBeTruthy();
      expect(item.originalHash).toBeTruthy();
    }
  });

  it("lineage traversal is not a side door around restricted content", () => {
    const asWarehouse = queries.traceLineage(ctx("WAREHOUSE"), "EXC-001");
    const contract = asWarehouse?.evidence.find((e) => e.item.sensitivity === "RESTRICTED");
    expect(contract).toBeDefined();
    expect(contract?.item.content).toBeUndefined();
    expect(contract?.item.contentHash.length).toBe(64);
    const asController = queries.traceLineage(ctx("CONTROLLER"), "EXC-001");
    expect(
      asController?.evidence.find((e) => e.item.sensitivity === "RESTRICTED")?.item.content,
    ).toBeDefined();
  });
});

describe("4. period lock blocks ordinary mutation", () => {
  it("blocks evidence, comments, drafts, and reviews while LOCKED", () => {
    commands.lockPeriod(ctx("CONTROLLER"), "LOCKED");
    const preparer = ctx("PREPARER");
    expect(() =>
      commands.submitEvidence(preparer, {
        title: "late", kind: "NOTE", content: {}, relatedObjectRef: "EXC-003",
      }),
    ).toThrow(PeriodLockedError);
    expect(() => commands.addComment(preparer, "EXC-003", "late")).toThrow(PeriodLockedError);
    expect(() => commands.createDraft(preparer, "MEMO", "EXC-003", "late")).toThrow(
      PeriodLockedError,
    );
    // Queries still work when locked.
    expect(queries.getBlockers(ctx("CONTROLLER"))).toHaveLength(7);
  });

  it("soft lock still allows controlled work", () => {
    commands.lockPeriod(ctx("CONTROLLER"), "SOFT_LOCKED");
    expect(() => commands.addComment(ctx("PREPARER"), "EXC-001", "note")).not.toThrow();
  });
});

describe("5. reopen requires authorized role + reason", () => {
  it("rejects reopen without a reason and from unauthorized roles", () => {
    commands.lockPeriod(ctx("CONTROLLER"), "LOCKED");
    expect(() => commands.reopenPeriod(ctx("PREPARER"), "need more evidence")).toThrow(
      AuthorizationError,
    );
    expect(() => commands.reopenPeriod(ctx("CONTROLLER"), "  ")).toThrow(
      InvalidTransitionError,
    );
    expect(commands.reopenPeriod(ctx("CONTROLLER"), "Late Redwood confirmation arrived")).toBe(
      "REOPENED",
    );
    // History retains the full lock/reopen trail with the reason.
    expect(ws.period.history.map((h) => h.to)).toEqual(["LOCKED", "REOPENED"]);
    expect(ws.period.history[1]?.reason).toContain("Redwood");
    // And the audit trail carries prior/new state + reason.
    const events = ws.audit.listForObject("FY2026-CLOSE");
    expect(events.at(-1)?.action).toBe("PERIOD_REOPENED");
    expect(events.at(-1)?.priorState).toBe("LOCKED");
    expect(events.at(-1)?.reason).toContain("Redwood");
  });
});

describe("6. NetSuite source fixtures unchanged after application commands", () => {
  it("no command mutates any source collection", () => {
    const before = hashObject({
      po: ws.dataset.purchaseOrders,
      ir: ws.dataset.itemReceipts,
      vb: ws.dataset.vendorBills,
      so: ws.dataset.salesOrders,
      iff: ws.dataset.itemFulfillments,
      inv: ws.dataset.customerInvoices,
      gl: ws.dataset.glBalances,
      units: ws.dataset.inventoryUnits,
      counts: ws.dataset.countResults,
    });
    const controller = ctx("CONTROLLER");
    commands.submitEvidence(controller, {
      title: "memo", kind: "NOTE", content: { a: 1 }, relatedObjectRef: "EXC-001",
    });
    commands.addComment(controller, "EXC-002", "checking");
    commands.createDraft(controller, "JE_DRAFT", "EXC-015", "reversal draft");
    commands.lockPeriod(controller, "SOFT_LOCKED");
    const after = hashObject({
      po: ws.dataset.purchaseOrders,
      ir: ws.dataset.itemReceipts,
      vb: ws.dataset.vendorBills,
      so: ws.dataset.salesOrders,
      iff: ws.dataset.itemFulfillments,
      inv: ws.dataset.customerInvoices,
      gl: ws.dataset.glBalances,
      units: ws.dataset.inventoryUnits,
      counts: ws.dataset.countResults,
    });
    expect(after).toBe(before);
  });
});

describe("7. failed/stale required source cannot create a false PASS", () => {
  it("EXC-001 stays open with a visible AccordVault warning", () => {
    const view = queries.getException(ctx("CONTROLLER"), "EXC-001");
    expect(view?.open).toBe(true);
    expect(
      view?.sourceCoverageWarnings.some((w) => w.sourceSystem === "ACCORD_VAULT"),
    ).toBe(true);
    expect(view?.sourceCoverageWarnings[0]?.status).toBe("STALE");
  });

  it("warnings surface degraded sources without changing any control result", () => {
    const all = queries.listExceptions(ctx("CONTROLLER"));
    const withWarnings = all.filter((v) => v.sourceCoverageWarnings.length > 0);
    expect(withWarnings.length).toBeGreaterThan(0);
    // Same aggregates as the golden baseline — warnings never flip results.
    const readiness = queries.getCloseReadiness(ctx("CONTROLLER"));
    expect(readiness.aggregates.closeReadinessBps).toBe(8142);
    expect(readiness.aggregates.blockerCount).toBe(7);
  });
});

describe("8. exception -> rule execution -> evidence -> source traversal", () => {
  it("traces EXC-001 to its rule run, evidence items, and NetSuite source refs", () => {
    const lineage = queries.traceLineage(ctx("CONTROLLER"), "EXC-001");
    expect(lineage?.ruleId).toBe("CUT-OUT-001");
    expect(lineage?.ruleExecution.inputHash.length).toBeGreaterThan(0);
    const kinds = new Set(lineage?.evidence.map((e) => e.item.kind));
    expect(kinds.has("SALES_ORDER")).toBe(true);
    expect(kinds.has("ITEM_FULFILLMENT")).toBe(true);
    expect(kinds.has("CARRIER_SHIPMENT")).toBe(true);
    expect(kinds.has("CONTRACT")).toBe(true);
    // The invoice corroborates; the missing-provision contract is REQUIRED_FOR.
    const invoice = lineage?.evidence.find((e) => e.item.kind === "CUSTOMER_INVOICE");
    expect(invoice?.linkType).toBe("CORROBORATES");
    const contract = lineage?.evidence.find((e) => e.item.kind === "CONTRACT");
    expect(contract?.linkType).toBe("REQUIRED_FOR");
    // Source identity is preserved down to the NetSuite ref.
    const soRef = lineage?.sourceRefs.find((r) => r.transactionNumber === "SO-26184");
    expect(soRef?.sourceSystem).toBe("NETSUITE_ERP");
    expect(soRef?.sourceHash.length).toBeGreaterThan(0);
  });

  it("count evidence conflicts with EXC-003's book position", () => {
    const lineage = queries.traceLineage(ctx("CONTROLLER"), "EXC-003");
    const countRow = lineage?.evidence.find((e) => e.item.kind === "COUNT_RESULT");
    expect(countRow?.linkType).toBe("CONFLICTS_WITH");
  });
});

/**
 * Source-document scoping across the projection layer.
 *
 * `projections.ts` claimed every function it delegates "scopes source
 * documents itself" — a claim about ten modules, made by a file that calls
 * into them and checks nothing. It was false of most of them, and live for one:
 * `getEoMethodology` read a forecast's own note straight off the fixture, so an
 * auditor whose workpaper scope hides FC-002 read its note on `/valuation`.
 * That is the side door around `listEvidence` that `makeRecordScope`'s own
 * docstring exists to close.
 *
 * Asserted here rather than restated in a comment, because a claim about a
 * boundary is worth exactly what checks it.
 */
describe("the projection layer withholds record text an auditor may not read", () => {
  const ws = createWorkspace();
  const projections = createProjectionService(ws);
  const as = (role: Parameters<typeof userByRole>[0]) => ({
    user: userByRole(role),
    correlationId: "T-PROJ-SCOPE",
    sourceInterface: "TEST",
  });

  it("withholds the forecast note the auditor's scope hides", () => {
    const controller = projections.getEoMethodology(as("CONTROLLER"));
    const auditor = projections.getEoMethodology(as("AUDITOR_READ_ONLY"));

    const noted = controller.signals.filter((s) => s.forecastNote !== undefined);
    // The premise. Without a note that is actually withheld from somebody, the
    // assertions below describe a case that does not occur.
    expect(noted.length).toBeGreaterThan(0);

    /**
     * Per row, against the scope that decides it — not "withheld always".
     *
     * The contract `makeRecordScope` implements is "withheld iff the record is
     * out of scope". Requiring every noted row to be withheld is stronger than
     * that, and over a population of one it is indistinguishable from it: a
     * second forecast note authored INSIDE the auditor's workpaper scope would
     * fail this test rather than the code. Both directions are asserted, so a
     * scope that stopped withholding anything fails just as loudly.
     */
    const scope = makeRecordScope(ws, userByRole("AUDITOR_READ_ONLY"));
    let withheldSome = 0;
    let visibleSome = 0;
    for (const row of noted) {
      const source = ws.dataset.forecasts.find((f) => f.sku === row.sku)?.sourceRef;
      const inScope = source !== undefined && scope(source);
      const seen = auditor.signals.find((s) => s.sku === row.sku);
      if (inScope) {
        visibleSome += 1;
        expect(seen?.forecastNote, `${row.sku} in-scope note was withheld anyway`).toBe(
          row.forecastNote,
        );
      } else {
        withheldSome += 1;
        expect(seen?.forecastNote, `${row.sku} note reached the auditor verbatim`).not.toBe(
          row.forecastNote,
        );
        expect(seen?.forecastNote).toMatch(/outside your access scope/);
      }
    }
    // Anti-vacuity on the branch that carries the fix. The other counter is
    // reported rather than required: today it is zero, and a fixture that gave
    // the auditor an in-scope note should exercise the first branch, not fail.
    expect(withheldSome, "no forecast note is out of the auditor's scope").toBeGreaterThan(0);
    expect(withheldSome + visibleSome).toBe(noted.length);
  });

  it("withholds the note without shrinking a single figure", () => {
    /**
     * The other side of the boundary, and the one the last remediation got
     * wrong: a scope-reduced figure printed as a complete one. The auditor
     * keeps every row and every quantity — only the record's own text is
     * withheld, and it says so rather than looking like a row that never had a
     * note.
     */
    const controller = projections.getEoMethodology(as("CONTROLLER"));
    const auditor = projections.getEoMethodology(as("AUDITOR_READ_ONLY"));
    expect(auditor.signals.map((s) => s.sku)).toEqual(controller.signals.map((s) => s.sku));
    expect(auditor.onHandUnits).toBe(controller.onHandUnits);
    expect(auditor.forecastUnitsTotal).toBe(controller.forecastUnitsTotal);
    expect(auditor.excessOverHorizonUnits).toBe(controller.excessOverHorizonUnits);
    expect(auditor.condition.unitsWithConditionRecord).toBe(
      controller.condition.unitsWithConditionRecord,
    );
    for (const row of controller.signals) {
      const seen = auditor.signals.find((s) => s.sku === row.sku);
      expect(seen?.onHandUnits, row.sku).toBe(row.onHandUnits);
      expect(seen?.agedUnits, row.sku).toBe(row.agedUnits);
      expect(seen?.excessOverHorizonUnits, row.sku).toBe(row.excessOverHorizonUnits);
    }
  });
});
