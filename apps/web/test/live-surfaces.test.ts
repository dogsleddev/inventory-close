import { afterEach, describe, expect, it } from "vitest";
import { buildAuditPackageData } from "../lib/server/audit-package-view";
import { buildPhysicalCountData } from "../lib/server/count-view";
import { buildProcurementData } from "../lib/server/procurement-view";
import { buildValuationData } from "../lib/server/valuation-view";
import { concludeException, controller, resetDemo } from "./support/live-close";

/**
 * The two remaining screens from the same family: /count and /valuation.
 *
 * Both bound their exception list to `queries.listExceptions` and then used it
 * for things that report an item's position NOW — a variance row's status pill
 * and its owner routing, the floor-to-sheet discovery card, the reserve
 * review's capsule. Read frozen, a concluded EXC-003 still routed a recount to
 * the warehouse on /count while its own drawer, on the same screen, read
 * "Resolved — No Adjustment".
 *
 * Owner routing is the one worth naming separately: `ownerForStatus` is a
 * function of the status, so a frozen status does not merely mislabel the row,
 * it addresses the work to the wrong person.
 */
describe("Physical Count and Valuation read the live close", () => {
  afterEach(resetDemo);

  const varianceFor = (id: string) =>
    buildPhysicalCountData(controller(), "T-LS-COUNT").variances.find(
      (r) => r.exceptionId === id,
    );
  const discovery = () => buildPhysicalCountData(controller(), "T-LS-DISC").discovery;
  const reviewFor = (id: string) =>
    buildValuationData(controller(), "T-LS-VAL").reserve?.reviews.find((r) => r.id === id);

  it("/count: the variance row and its owner move with the conclusion", () => {
    const before = varianceFor("EXC-003");
    expect(before?.status?.label).toBe("Recount Required");
    const ownerBefore = before?.owner;
    expect(ownerBefore).toBeTruthy();

    concludeException("EXC-003");

    const after = varianceFor("EXC-003");
    expect(after?.status?.label).toBe("Resolved — No Adjustment");
    // Routing follows the status, so it cannot still point at the recount.
    expect(after?.owner).not.toBe(ownerBefore);
  });

  it("/count: the floor-to-sheet discovery card moves with it too", () => {
    expect(discovery()?.exceptionId).toBe("EXC-004");
    expect(discovery()?.status?.label).not.toBe("Resolved — No Adjustment");

    concludeException("EXC-004");

    expect(discovery()?.status?.label).toBe("Resolved — No Adjustment");
  });

  it("/valuation: the reserve review capsule moves with the conclusion", () => {
    expect(reviewFor("EXC-011")?.status.label).toBe("Accounting Review");

    concludeException("EXC-011");

    expect(reviewFor("EXC-011")?.status.label).toBe("Resolved — No Adjustment");
  });
});

/**
 * The other half of the drawer-badge fix.
 *
 * `assembleDrawer` was narrowed by the live status, which made every one of
 * its eight callers' drawers correct. It did NOT make their ROWS correct:
 * /procurement and the Audit Package still bound `queries.listExceptions`, so
 * their rows rendered the frozen status beside a drawer, opened from that same
 * row, rendering the live one. That is commit 212d219's row-vs-drawer
 * contradiction with the halves swapped — and narrowing the drawer is what
 * made this reachable.
 *
 * `costing-view` is deliberately absent. It binds the list too, but uses it
 * only to find the view it hands to `gatherExceptionContext`, which fetches
 * its own live position, so nothing it renders moves. It was rebound for
 * uniformity and is not claimed as a fix.
 */
describe("Procurement and the Audit Package read the live close", () => {
  afterEach(resetDemo);

  const featured = () =>
    buildProcurementData(controller(), "T-LS-PROC").match?.featured.find(
      (c) => c.exceptionId === "EXC-002",
    );
  const related = () =>
    buildAuditPackageData(controller(), "", "T-LS-PKG").detail?.related.find(
      (r) => r.id === "EXC-001",
    );

  it("/procurement: the match capsule, the footnote and the ember agree after a conclusion", () => {
    const before = featured();
    expect(before?.close.label).toBe("Accounting Review");
    expect(before?.close.variant).toBe("frost");
    expect(before?.ember).toBe(true);
    expect(before?.footnote.tone).toBe("ember");

    concludeException("EXC-002");

    const after = featured();
    expect(after?.close.label).toBe("Resolved — No Adjustment");
    expect(after?.close.variant).toBe("aurora");
    // The one that survived rebinding the list: `tone` was a literal passed by
    // the featured loop off `closeMatchStatus`, a rules artifact that never
    // moves. It painted the alarm treatment on a card whose own footnote,
    // twelve lines below it, had already turned aurora.
    expect(after?.ember).toBe(false);
    expect(after?.footnote.tone).toBe("aurora");
    expect(after?.footnote.glyph).toBe("✓");
  });

  it("/audit-package: the related-exception row moves with the conclusion", () => {
    const before = related();
    expect(before?.status.label).toBe("Waiting on Contract");
    expect(before?.open).toBe(true);

    concludeException("EXC-001");

    const after = related();
    expect(after?.status.label).toBe("Resolved — No Adjustment");
    expect(after?.open).toBe(false);
  });

  /**
   * The class, over both screens: no row may pair a resolved capsule with the
   * alarm treatment. This is the assertion `drawer-blocker.test.ts` makes
   * about badges, made about the row the badge sits on.
   */
  it("never pairs a resolved capsule with the ember treatment", () => {
    concludeException("EXC-002");
    concludeException("EXC-001");

    const proc = buildProcurementData(controller(), "T-LS-PROC-ALL");
    const offenders = [...(proc.match?.featured ?? [])]
      .filter((c) => c.close.label.startsWith("Resolved") && c.ember)
      .map((c) => `${c.po} — ${c.close.label} + ember`);
    expect(offenders).toEqual([]);

    const pkg = buildAuditPackageData(controller(), "", "T-LS-PKG-ALL");
    const rowOffenders = (pkg.detail?.related ?? [])
      .filter((r) => r.status.label.startsWith("Resolved") && r.open)
      .map((r) => `${r.id} — ${r.status.label} + open`);
    expect(rowOffenders).toEqual([]);
  });
});
