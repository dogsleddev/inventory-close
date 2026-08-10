import { beforeAll, describe, expect, it } from "vitest";
import { userByRole, type DemoUser } from "@icg/data";
import type { Role } from "@icg/domain";
import { createQueryService, createWorkspace, type QueryService } from "@icg/services";
import {
  answerQuestion,
  checkNarration,
  withNarration,
  type AiInteraction,
  type AiToolContext,
} from "../src/index.js";

let queries: QueryService;
beforeAll(() => {
  queries = createQueryService(createWorkspace());
});

/** The tool context for a given demo user — the caller's own, as in production. */
const makeToolContext = (user: DemoUser): AiToolContext => ({
  queries,
  ctx: { user, correlationId: `T-FTR-${user.id}`, sourceInterface: "ASK_GAURD" },
});

const asUser = (role: Role): DemoUser => userByRole(role);

/**
 * Full-tree adversarial review regressions (post stage 09).
 *
 * The review's four Ask Gaurd findings were all the same shape: an
 * ENUMERATED denylist standing in for a category. Each test below therefore
 * iterates the category — every unauthorized role, every finality word,
 * every zero-word, every action verb — rather than pinning the one phrase
 * the red-team happened to try.
 */

/* ------------------------------------------------------------------ */
/* A refusal must name which kind of nothing it is                     */
/* ------------------------------------------------------------------ */

describe("a denied resolve-probe is NOT_AUTHORIZED, never NO_SUCH_OBJECT", () => {
  /**
   * The engine probes whether a scoped object resolves before it may claim
   * it does not exist. When the PROBE ITSELF is denied, an undefined result
   * means "you may not look", not "it is not there" — and answering
   * NO_SUCH_OBJECT states a fact about the world on the strength of a
   * permission check.
   */
  const UNAUTHORIZED_ROLES = ["SYSTEM_ADMIN"] as const;
  const NO_INTENT_QUESTION = "hello there";

  it("never denies the existence of a real object to a role that merely cannot look", () => {
    for (const role of UNAUTHORIZED_ROLES) {
      const t = makeToolContext(asUser(role));
      // Every scope kind the engine probes: an exception id and a serial.
      for (const scope of [
        { exceptionId: "EXC-001" },
        { serial: "KE-E2-1048" },
        { serial: "KE-X1-8842" },
      ]) {
        const out = answerQuestion(t, NO_INTENT_QUESTION, scope);
        const probeDenied = out.toolCalls.some((c) => c.outcome === "NOT_AUTHORIZED");
        expect(probeDenied, `${role} ${JSON.stringify(scope)} ran no denied probe`).toBe(true);
        expect(
          out.refusal?.reason,
          `${role} was told ${JSON.stringify(scope)} does not exist`,
        ).toBe("NOT_AUTHORIZED");
        expect(out.refusal?.message).not.toMatch(/no object/i);
      }
    }
  });

  it("still says NO_SUCH_OBJECT for an authorized role and an object that truly is absent", () => {
    const t = makeToolContext(asUser("CONTROLLER"));
    const out = answerQuestion(t, "hello there", { serial: "KE-Z9-0000" });
    expect(out.refusal?.reason).toBe("NO_SUCH_OBJECT");
  });

  it("says NO_SUCH_OBJECT only when a tool actually established the absence", () => {
    const t = makeToolContext(asUser("CONTROLLER"));
    const out = answerQuestion(t, "hello there", { serial: "KE-Z9-0000" });
    // The claim rests on a probe that ran and returned OK — never on the
    // shape of the request.
    expect(out.toolCalls.some((c) => c.tool === "search_serial" && c.outcome === "OK")).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Guardrails: categories, not enumerated phrases                      */
/* ------------------------------------------------------------------ */

/** A minimal interaction whose answer is an OPEN item with a real status. */
function openInteraction(): AiInteraction {
  const t = makeToolContext(asUser("CONTROLLER"));
  const out = answerQuestion(t, "Why is this still open?", { exceptionId: "EXC-001" });
  expect(out.answer).toBeDefined();
  expect(out.answer?.status).not.toMatch(/RESOLVED/i);
  return out;
}

describe("narration may not call an open item finished, in any word", () => {
  const FINALITY_CLAIMS = [
    "This exception is fully concluded; no open item remains.",
    "The contract question is settled and the matter is finalized.",
    "The matter has been finalised on the accounting side.",
    "This is resolved from the close's point of view.",
    "The item is closed as far as the evidence goes.",
    "Nothing further is outstanding for this unit.",
    "It is no longer open in any meaningful sense.",
    "The review is fully complete.",
  ];

  it("rejects every finality wording while the answer's status is open", () => {
    const interaction = openInteraction();
    for (const narration of FINALITY_CLAIMS) {
      const verdict = checkNarration(interaction, narration);
      expect(verdict.ok, `guardrail admitted: "${narration}"`).toBe(false);
      expect(verdict.violations).toContain("FORBIDDEN_ACTION");
    }
  });

  it("attaches none of them, so the reader never sees one", () => {
    const interaction = openInteraction();
    for (const narration of FINALITY_CLAIMS) {
      const { interaction: out } = withNarration(interaction, narration, {
        providerName: "test-provider",
        modelVersion: "test-1",
      });
      expect(out.narrationAvailable, `attached: "${narration}"`).toBe(false);
      expect(out.narration).toBeUndefined();
    }
  });
});

describe("narration may not state a quantity, including a zero", () => {
  const QUANTITY_CLAIMS = [
    "The reserve balance is zero.",
    "The count is nil.",
    "None of the balance remains unreconciled.",
    "There are no blockers left to clear.",
    "A single item is outstanding.",
    "A couple of records are missing.",
    "The difference is fourteen thousand.",
    "The exposure is $198,950.",
    "Readiness sits at 81.42%.",
  ];

  it("rejects every quantity wording, spelled or symbolic", () => {
    const interaction = openInteraction();
    for (const narration of QUANTITY_CLAIMS) {
      const verdict = checkNarration(interaction, narration);
      expect(verdict.ok, `guardrail admitted a figure: "${narration}"`).toBe(false);
      expect(verdict.violations).toContain("NUMERIC_DRIFT");
    }
  });
});

describe("narration may not claim an action the product cannot take", () => {
  const ACTION_CLAIMS = [
    "The period is effectively signed.",
    "Consider the entries booked.",
    "The adjustments are posted.",
    "I approved the proposal for you.",
    "The journal entry has been booked into NetSuite.",
    "Consider this approved.",
    "The close is finalized.",
    "No further review is needed.",
    "It is safe to post.",
  ];

  it("rejects every claimed action, in first person, passive, and impersonal voice", () => {
    const interaction = openInteraction();
    for (const narration of ACTION_CLAIMS) {
      const verdict = checkNarration(interaction, narration);
      expect(verdict.ok, `guardrail admitted an action claim: "${narration}"`).toBe(false);
    }
  });

  it("still admits prose that only explains, so the guard is not vacuous", () => {
    const interaction = openInteraction();
    // No figures, no identifiers, no finality, no claimed action: the shape
    // narration is actually allowed to take.
    const allowed = [
      "The unit shipped before the balance-sheet date, but the required contract provision has not been located, so the accounting conclusion is still open.",
      "Operational systems show the unit deployed; the accounting evidence needed to support that treatment is missing.",
    ];
    for (const narration of allowed) {
      const verdict = checkNarration(interaction, narration);
      expect(verdict.ok, `guardrail rejected allowed prose: ${verdict.violations.join()}`).toBe(
        true,
      );
    }
  });
});
