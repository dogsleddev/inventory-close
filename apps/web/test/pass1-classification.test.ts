import { describe, expect, it } from "vitest";
import { buildDataset } from "@icg/data";
import { classificationLabel } from "../lib/server/humanize";

/**
 * Pass-1 regression (F14): classification enum values render through
 * classificationLabel, which must produce a real label for EVERY value the
 * dataset carries — an unmapped acronym title-cased into "Git" or "Rma" is
 * the defect class. Iterates the dataset's values, not a hand list.
 */
describe("classification labels", () => {
  const classifications = new Set(buildDataset().inventoryUnits.map((u) => u.classification));

  // CANONICAL_SPEC §5's own class names — the display vocabulary. A new
  // classification value must be added here (and to the label map if it is
  // an acronym) or this test fails, which is the point.
  const SPEC_NAMES: Record<string, string> = {
    FINISHED_HARDWARE: "Finished Hardware",
    GIT: "GIT",
    DEMO: "Demo",
    LOANER: "Loaner",
    RMA: "RMA",
    DAMAGED: "Damaged",
    THIRD_PARTY: "Third Party",
    VALUATION_REVIEW: "Valuation Review",
  };

  it("labels every classification the dataset carries with the spec's name", () => {
    expect(classifications.size).toBeGreaterThanOrEqual(8);
    for (const c of classifications) {
      expect(SPEC_NAMES[c], `spec name missing for ${c}`).toBeDefined();
      expect(classificationLabel(c), c).toBe(SPEC_NAMES[c]);
    }
  });

  it("spells out the spec's own class names for the multi-word values", () => {
    expect(classificationLabel("FINISHED_HARDWARE")).toBe("Finished Hardware");
    expect(classificationLabel("VALUATION_REVIEW")).toBe("Valuation Review");
    expect(classificationLabel("THIRD_PARTY")).toBe("Third Party");
    expect(classificationLabel("GIT")).toBe("GIT");
    expect(classificationLabel("RMA")).toBe("RMA");
  });
});
