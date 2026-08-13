import { afterEach, describe, expect, it } from "vitest";
import type { ExceptionDrawerData } from "../lib/view-model";
import { buildAdjustmentsData } from "../lib/server/adjustments-view";
import { buildPhysicalCountData } from "../lib/server/count-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { buildValuationData } from "../lib/server/valuation-view";
import { concludeException, controller, resetDemo } from "./support/live-close";

/**
 * One exception, one position, on every screen that draws it.
 *
 * `assembleDrawer` computed its status from `livePosition(context)` and then
 * emitted the BLOCKER badge from whatever set the caller happened to hold.
 * Eight callers build this drawer; seven passed the rules' frozen blocker set.
 * So concluding EXC-015 gave /reconciliation and /adjustments a drawer reading
 * `{status: 'Resolved — No Adjustment', blocker: true}` — the green resolved
 * capsule and the red BLOCKER badge 6px apart in `ExceptionDrawer.tsx:52-66` —
 * while the /exceptions queue drawer for the same item, whose caller passes a
 * live set, read `blocker: false`.
 *
 * The fix is in the assembler, not in the callers. Correcting callers is how
 * this class kept reopening: commit 212d219 ("Fix the fix: it made the row
 * live and left the drawer frozen") corrected one of the eight.
 */

const RESOLVED = "Resolved — No Adjustment";

type Surface = {
  readonly screen: string;
  /** An exception this screen draws that the rules DO list as a blocker. */
  readonly id: string;
  readonly drawers: () => Readonly<Record<string, ExceptionDrawerData>>;
};

const SURFACES: readonly Surface[] = [
  {
    screen: "/reconciliation",
    id: "EXC-015",
    drawers: () => buildReconciliationData(controller(), "", "T-DB-RECON").drawers,
  },
  {
    screen: "/adjustments",
    id: "EXC-015",
    drawers: () => buildAdjustmentsData(controller(), "T-DB-ADJ").drawers,
  },
  {
    screen: "/count",
    id: "EXC-003",
    drawers: () => buildPhysicalCountData(controller(), "T-DB-COUNT").drawers,
  },
  {
    screen: "/valuation",
    id: "EXC-011",
    drawers: () => buildValuationData(controller(), "T-DB-VAL").drawers,
  },
];

describe("An exception the close has resolved carries no BLOCKER badge", () => {
  afterEach(resetDemo);

  it("shows the badge on all four screens before anyone concludes", () => {
    for (const surface of SURFACES) {
      const drawer = surface.drawers()[surface.id];
      expect(drawer, `${surface.screen} draws no ${surface.id}`).toBeDefined();
      expect(drawer?.blocker, `${surface.screen} ${surface.id}`).toBe(true);
      expect(drawer?.status.label, `${surface.screen} ${surface.id}`).not.toBe(RESOLVED);
    }
  });

  it("drops the badge on all four once management has concluded", () => {
    for (const surface of SURFACES) concludeException(surface.id);

    for (const surface of SURFACES) {
      const drawer = surface.drawers()[surface.id];
      expect(drawer, `${surface.screen} draws no ${surface.id}`).toBeDefined();
      // The capsule and the badge, from the same drawer object.
      expect(drawer?.status.label, `${surface.screen} ${surface.id}`).toBe(RESOLVED);
      expect(drawer?.blocker, `${surface.screen} ${surface.id}`).toBe(false);
    }
  });

  /**
   * The class, not the four instances. A caller added later inherits this
   * because the narrowing is in the assembler; a caller "fixed" by hand does
   * not, which is what the last attempt demonstrated.
   */
  it("never pairs a resolved capsule with a blocker badge, on any drawer", () => {
    for (const surface of SURFACES) concludeException(surface.id);

    const offenders: string[] = [];
    for (const surface of SURFACES) {
      for (const [id, drawer] of Object.entries(surface.drawers())) {
        if (drawer.status.label.startsWith("Resolved") && drawer.blocker) {
          offenders.push(`${surface.screen} ${id} — ${drawer.status.label} + BLOCKER`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
