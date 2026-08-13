import { afterEach, describe, expect, it } from "vitest";
import { buildPhysicalCountData } from "../lib/server/count-view";
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
