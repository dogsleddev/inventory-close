import { afterEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { buildCloseMemoData } from "../lib/server/memo-view";
import { runRecordConclusion, runSignOff } from "../lib/server/workflow-actions";
import {
  baselineBlockerIds,
  controller,
  resetDemo,
  resolveAllBut,
  satisfyRequirements,
} from "./support/live-close";

/**
 * The demo's climax click, at the count that exposes the sentence.
 *
 * Both of these condition the NOUN on the count and leave the VERB a bare
 * literal, so at one they read "1 blocker remain." and "of which 1 remain
 * open. 1 of those blocks sign-off" — a plural verb and a singular verb about
 * the same item inside one sentence.
 *
 * Neither is reachable from a fresh workspace: seven is plural and every
 * literal is correct there. That is why the count is driven to one first, and
 * why a test written against the baseline would have passed on the defect.
 */
describe("Count-varying prose agrees with its own count at one", () => {
  afterEach(resetDemo);

  it("the conclusion status line says '1 blocker remains.'", () => {
    // The message is post-write and live (workflow-actions.ts:58 recomputes
    // the effective close), so the count it prints is the count AFTER this
    // conclusion. Leaving two and concluding one lands it on exactly one.
    const ids = baselineBlockerIds();
    resolveAllBut(2);
    const target = ids[ids.length - 2] ?? "";
    expect(target).not.toBe("");
    satisfyRequirements(target);

    const result = runRecordConclusion(controller(), "T-AGREE", {
      exceptionId: target,
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "Support obtained and reviewed; no adjustment required.",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/1 blocker remains\./);
    expect(result.message).not.toMatch(/1 blocker remain\./);
    expect(result.message).not.toMatch(/1 blockers/);
  });

  it("the sign-off refusal says '1 blocker remains open.'", () => {
    resolveAllBut(1);
    const result = runSignOff(controller(), "T-AGREE-SIGN");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/1 blocker remains open\./);
    expect(result.message).not.toMatch(/1 blocker remain open/);
  });

  it("the memo's suggested body agrees with itself at one", () => {
    resolveAllBut(1);
    const body = buildCloseMemoData(userByRole("CONTROLLER"), "T-AGREE-MEMO").suggestedBody;

    expect(body).toMatch(/of which 1 remains open/);
    expect(body).not.toMatch(/of which 1 remain open/);
    // The other half of the same sentence, which was already right, must stay
    // right — a fix that flipped both verbs to plural would satisfy the line
    // above and break this one.
    expect(body).toMatch(/1 of those blocks sign-off/);
  });

  /**
   * The plural side, so a fix that hard-codes the singular cannot pass. This
   * is the state every other test in the suite runs at, which is exactly why
   * the defect survived: at seven, every literal is correct.
   */
  it("still reads as a plural at the baseline", () => {
    const body = buildCloseMemoData(userByRole("CONTROLLER"), "T-AGREE-BASE").suggestedBody;
    expect(body).toMatch(/The close raised 15 exceptions, of which 7 remain open/);
    expect(body).toMatch(/7 of those block sign-off/);

    const result = runSignOff(controller(), "T-AGREE-SIGN-BASE");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/7 blockers remain open\./);
  });
});
