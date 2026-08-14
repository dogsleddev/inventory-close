import { describe, expect, it } from "vitest";
import { REASON_CODE_KIND, namesContradiction } from "@icg/domain";
import { runClose } from "../src/index.js";
import { closeInputFromDataset } from "./helpers.js";

/**
 * Every reason code the close emits is classified.
 *
 * `REASON_CODE_KIND` decides whether a finding's narrative may be filed as
 * CONFLICTING EVIDENCE, and its default is deliberately asymmetric: an
 * unclassified code is not a contradiction, because over-claiming a conflict
 * sends a reader looking for a record that does not exist.
 *
 * That default is a backstop, not a way to skip the decision. A code added to
 * a rule and not added to the table would quietly take the safe branch and
 * nobody would find out — which is the same shape as the enumerated allowlists
 * this codebase has already been bitten by twice. So the table is asserted
 * against what the rules ACTUALLY emit, derived from a real close rather than
 * from a hand-copied list.
 */

const close = runClose(closeInputFromDataset());

const emittedCodes = (): readonly string[] => [
  ...new Set(close.exceptions.flatMap((e) => e.finding.reasonCodes)),
];

describe("the reason-code classification covers what the rules emit", () => {
  it("classifies every code in the close", () => {
    const unclassified = emittedCodes().filter((c) => REASON_CODE_KIND[c] === undefined);
    expect(
      unclassified,
      `unclassified reason codes — add them to REASON_CODE_KIND in @icg/domain: ${unclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("is asserted against a non-trivial population", () => {
    // Without this the assertion above passes on an empty close.
    expect(emittedCodes().length).toBeGreaterThan(15);
    expect(close.exceptions.length).toBe(15);
  });

  it("finds contradictions and absences in the real close, not just in theory", () => {
    // Both branches must actually occur, or `namesContradiction` is being
    // asserted somewhere it cannot discriminate.
    const open = close.exceptions.filter((e) => !e.status.startsWith("RESOLVED"));
    const withConflict = open.filter((e) => namesContradiction(e.finding.reasonCodes));
    expect(withConflict.length).toBeGreaterThan(0);
    expect(withConflict.length).toBeLessThan(open.length);
  });

  it("uses only the three declared kinds", () => {
    for (const [code, kind] of Object.entries(REASON_CODE_KIND)) {
      expect(["CONTRADICTION", "ABSENCE", "JUDGEMENT"], code).toContain(kind);
    }
  });
});
