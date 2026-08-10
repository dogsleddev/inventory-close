import { beforeEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import {
  createCommandService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/** Query correctness, Financial Life, audit behavior, and demo reset. */

const controller: ServiceContext = {
  user: userByRole("CONTROLLER"),
  correlationId: "CORR-Q",
  sourceInterface: "TEST",
};

let ws: Workspace;
let queries: ReturnType<typeof createQueryService>;
let commands: ReturnType<typeof createCommandService>;

beforeEach(() => {
  ws = createWorkspace();
  queries = createQueryService(ws);
  commands = createCommandService(ws);
});

describe("query services", () => {
  it("serves the canonical overview numbers", () => {
    const r = queries.getCloseReadiness(controller);
    expect(r.totalBasisPoints).toBe(8142);
    expect(r.aggregates.blockerExposureCents).toBe(19895000);
    expect(r.aggregates.grossGlDifferenceCents).toBe(1245000);
    expect(r.aggregates.pbcReady).toBe(17);
    expect(r.aggregates.sourceHealthBps).toBe(9167);
    expect(queries.getBlockers(controller)).toHaveLength(7);
  });

  it("global search finds book, off-book, and sold serials with provenance", () => {
    const onBook = queries.searchSerial(controller, "ke-e2-1048");
    expect(onBook).toHaveLength(1);
    expect(onBook[0]?.onBook).toBe(true);
    // The EXC-004 discovery serial is off-book but must be discoverable.
    const offBook = queries.searchSerial(controller, "KE-X1-8842");
    expect(offBook).toHaveLength(1);
    expect(offBook[0]?.onBook).toBe(false);
    expect(offBook[0]?.foundIn).toContain("COUNT_TEST");
    // Sold serials (clean chains) are reachable through their transactions.
    const soldSerial = ws.dataset.itemFulfillments
      .find((f) => f.transactionNumber !== "IF-261972")!
      .lines.flatMap((l) => l.serials ?? [])[0]!;
    const sold = queries.searchSerial(controller, soldSerial);
    expect(sold[0]?.onBook).toBe(false);
    expect(sold[0]?.foundIn).toContain("NETSUITE_TXN");
  });

  it("tracks non-serialized accessories at batch level, not as missing paper", () => {
    const accessory = ws.dataset.inventoryUnits.find((u) => u.sku === "KV-D1")!.serial;
    const life = queries.getFinancialLife(controller, accessory);
    expect(life.buySideTracking).toBe("BATCH");
    expect(life.unit?.serialized).toBe(false);
    expect(life.missing).not.toContain("Purchase Order");
    expect(life.missing).not.toContain("Item Receipt");
    expect(life.missing).not.toContain("Vendor Bill");
  });

  it("reconstructs the EXC-001 Financial Life with missing steps visible", () => {
    const life = queries.getFinancialLife(controller, "KE-E2-1048");
    expect(life.unit?.location).toBe("PRIMARY_WAREHOUSE");
    expect(life.unit?.glAccount).toBe("1200");
    expect(life.buySide.purchaseOrder).toBeDefined();
    expect(life.buySide.itemReceipt).toBeDefined();
    expect(life.sellSide.salesOrder).toBe("SO-26184");
    expect(life.sellSide.itemFulfillment).toBe("IF-261972");
    expect(life.sellSide.deliveredAt?.startsWith("2026-12-29")).toBe(true);
    expect(life.sellSide.installedAt?.startsWith("2026-12-30")).toBe(true);
    expect(life.sellSide.firstOnlineAt?.startsWith("2026-12-30")).toBe(true);
    expect(life.sellSide.customerInvoice).toBe("INV-2027-00418");
    expect(life.exceptions).toContain("EXC-001");
    // Shipped and invoiced, yet still on the book: relief visibly missing.
    expect(life.missing).toContain("Inventory relief");
  });

  it("reconstructs a quiet warehouse unit with a complete buy side and no sale", () => {
    const serial = ws.dataset.inventoryUnits.find(
      (u) => u.sku === "KE-M1" && u.location === "PRIMARY_WAREHOUSE",
    )!.serial;
    const life = queries.getFinancialLife(controller, serial);
    expect(life.buySide.purchaseOrder).toBeDefined();
    expect(life.sellSide.salesOrder).toBeUndefined();
    expect(life.missing).not.toContain("Purchase Order");
    expect(life.exceptions).not.toContain("EXC-001");
  });

  it("serves counts, reconciliation, matches, chains, and PBC", () => {
    expect(queries.getCountSummary(controller).populationUnits).toBe(1065);
    expect(queries.getReconciliation(controller).items).toHaveLength(3);
    expect(queries.getProcurementMatches(controller).length).toBeGreaterThan(80);
    expect(
      queries.getCommercialChains(controller).find((c) => c.subjectRef === "SO-26184")
        ?.requiredMissingCount,
    ).toBeGreaterThanOrEqual(2);
    expect(queries.getPbcStatus(controller)).toHaveLength(21);
  });

  it("serves the PBC package with versions, dependencies, and staleness", () => {
    const pkg = queries.getPbcPackage(controller);
    expect(pkg).toHaveLength(21);
    // Baseline: nothing has changed since preparation — no REFRESH_REQUIRED.
    expect(pkg.every((i) => i.status !== "REFRESH_REQUIRED")).toBe(true);
    expect(pkg.filter((i) => i.immutable)).toHaveLength(5); // the Provided set
    const outbound = pkg.find((i) => i.id === "PBC-008");
    expect(outbound?.dependsOn).toContain("EXC-001");
    // Simulate underlying controlled state changing after preparation:
    ws.pbcPreparedState.set("PBC-008", "stale-hash");
    const refreshed = queries.getPbcPackage(controller).find((i) => i.id === "PBC-008");
    expect(refreshed?.status).toBe("REFRESH_REQUIRED");
  });
});

describe("audit behavior", () => {
  it("appends a full docs/15 event for every material command", () => {
    commands.submitEvidence(controller, {
      title: "x", kind: "NOTE", content: { n: 1 }, relatedObjectRef: "EXC-002",
    });
    commands.addComment(controller, "EXC-002", "note");
    const events = ws.audit.list();
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.actor).toBe(controller.user.id);
      expect(e.actorRole).toBe("CONTROLLER");
      expect(e.sourceInterface).toBe("TEST");
      expect(e.correlationId).toBe("CORR-Q");
      expect(e.occurredAt > "2027-01-07").toBe(true);
    }
  });

  it("is append-only: reads return copies, and there is no mutation API", () => {
    commands.addComment(controller, "EXC-001", "first");
    const snapshot = ws.audit.list();
    (snapshot as unknown as unknown[]).pop();
    expect(ws.audit.count()).toBe(1);
    const log = ws.audit as unknown as Record<string, unknown>;
    expect(log["update"]).toBeUndefined();
    expect(log["delete"]).toBeUndefined();
    expect(log["remove"]).toBeUndefined();
  });
});

describe("demo reset", () => {
  it("rebuilds from source facts with identical canonical outputs and preserves the audit trail", () => {
    commands.addComment(controller, "EXC-001", "pre-reset note");
    const beforeHash = ws.close.runManifest.outputHash;
    const aggregates = commands.resetDemo(controller);
    // Derived, not hard-coded: the same facts produce the same numbers.
    expect(aggregates.closeReadinessBps).toBe(8142);
    expect(aggregates.blockerCount).toBe(7);
    expect(ws.close.runManifest.outputHash).toBe(beforeHash);
    // Working state cleared; audit history retained and grew.
    expect(ws.comments).toHaveLength(0);
    expect(ws.audit.list().map((e) => e.action)).toEqual(["COMMENT_ADDED", "DEMO_RESET"]);
  });
});

describe("read-only NetSuite adapter", () => {
  it("exposes no mutation-shaped methods", async () => {
    const { createFixtureNetSuiteAdapter } = await import("@icg/data");
    const adapter = createFixtureNetSuiteAdapter(ws.dataset);
    const methods = Object.keys(adapter);
    expect(methods.length).toBeGreaterThan(0);
    const forbidden = /^(set|post|create|update|delete|remove|approve|edit|write|mutate|adjust|submit)/i;
    for (const name of methods) {
      expect(name).not.toMatch(forbidden);
      expect(name.startsWith("get")).toBe(true);
    }
    const receipts = await adapter.getItemReceipts();
    expect(receipts.length).toBeGreaterThan(80);
  });
});
