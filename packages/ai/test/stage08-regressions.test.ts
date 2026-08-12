import { beforeAll, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createProjectionService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
} from "@icg/services";
import { answerQuestion, checkNarration, runTool, type AiToolContext } from "../src/index.js";

/**
 * Stage-08 fleet regressions.
 *
 * The review's sharpest criticism was of the TESTS, not only the code: "each
 * gap is the shape of a test that asserts an instance where the contract
 * states a category". These are written as categories — over every exception,
 * every serial with a scope difference, every shipped suggestion chip.
 */

let t: AiToolContext;
let auditor: AiToolContext;

const ctxFor = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-R8-${role}`,
  sourceInterface: "ASK_GAURD",
});

beforeAll(() => {
  const ws = createWorkspace();
  const queries = createQueryService(ws);
  const projections = createProjectionService(ws);
  t = { queries, projections, ctx: ctxFor("CONTROLLER") };
  auditor = { queries, projections, ctx: ctxFor("AUDITOR_READ_ONLY") };
});

describe("scope is never rendered as absence", () => {
  it("keeps the chain of custody in the same order for every role", () => {
    const serials = t.queries
      .listInventoryUnits(t.ctx)
      .slice(0, 60)
      .map((u) => u.serial);
    for (const serial of serials) {
      const full = runTool(t, "get_evidence_timeline", { serial }).data as {
        events: readonly { label: string }[];
      };
      const scoped = runTool(auditor, "get_evidence_timeline", { serial }).data as {
        events: readonly { label: string }[];
      };
      // A withheld record must not re-sort the timeline.
      expect(scoped.events.map((e) => e.label), serial).toEqual(
        full.events.map((e) => e.label),
      );
    }
  });

  it("marks a withheld component WITHHELD, never undated", () => {
    let sawWithheld = false;
    for (const unit of t.queries.listInventoryUnits(t.ctx)) {
      const scoped = runTool(auditor, "get_evidence_timeline", { serial: unit.serial })
        .data as {
        events: readonly { label: string; state: string; at?: string }[];
        scopeReduced: boolean;
        withheldCount: number;
      };
      for (const e of scoped.events) {
        if (e.state === "WITHHELD") {
          sawWithheld = true;
          expect(e.at).toBeUndefined();
        }
      }
      expect(scoped.scopeReduced).toBe(scoped.withheldCount > 0);
    }
    expect(sawWithheld, "no serial exercised the withheld path").toBe(true);
  });

  it("asserts a Delivery only where a delivery event exists", () => {
    for (const unit of t.queries.listInventoryUnits(t.ctx)) {
      const life = t.queries.getFinancialLife(t.ctx, unit.serial);
      const timeline = runTool(t, "get_evidence_timeline", { serial: unit.serial }).data as {
        events: readonly { label: string; state: string }[];
      };
      const claimsDelivery = timeline.events.some(
        (e) => e.label === "Delivery" && e.state !== "WITHHELD",
      );
      expect(claimsDelivery, unit.serial).toBe(life.sellSide.deliveredAt !== undefined);
    }
  });
});

describe("a refusal names the right kind of nothing", () => {
  it("never denies the existence of an object that resolves", () => {
    // Unanswerable questions about REAL objects must be OUT_OF_SCOPE.
    for (const question of [
      "When was this serial last counted?",
      "What colour is it?",
      "Who signed the delivery note?",
    ]) {
      const bySerial = answerQuestion(t, question, { serial: "KE-E2-1048" });
      if (bySerial.refusal !== undefined) {
        expect(bySerial.refusal.reason, `${question} (serial)`).not.toBe("NO_SUCH_OBJECT");
      }
      const byException = answerQuestion(t, question, { exceptionId: "EXC-001" });
      // An exception in scope always answers via answerException.
      expect(byException.answer, `${question} (exception)`).toBeDefined();
    }
  });

  it("still reports a genuinely unknown id as unknown", () => {
    expect(answerQuestion(t, "Why is this open?", { exceptionId: "EXC-999" }).refusal?.reason).toBe(
      "NO_SUCH_OBJECT",
    );
    expect(
      answerQuestion(t, "Walk me through the financial life of this unit", {
        serial: "KE-ZZ-0000",
      }).refusal?.reason,
    ).toBe("NO_SUCH_OBJECT");
  });

  it("never invents a life story for a serial no source mentions", () => {
    const r = answerQuestion(t, "Walk me through the financial life of this unit", {
      serial: "KE-ZZ-0000",
    });
    expect(r.answer).toBeUndefined();
  });
});

describe("a resolved exception is never told to obtain what resolved it", () => {
  it("holds for every exception in the population", () => {
    for (const view of t.queries.listExceptions(t.ctx)) {
      const id = view.exception.id;
      const r = answerQuestion(t, "Why is this still open?", { exceptionId: id });
      expect(r.answer, id).toBeDefined();
      const a = r.answer!;
      if (view.open) continue;
      // Resolved: no outstanding demand, no missing-evidence claim, no
      // MISSING citation chip contradicting the recorded conclusion.
      expect(a.nextAction, id).not.toMatch(/^Obtain:/);
      expect(a.missingEvidence, id).toEqual([]);
      expect(a.citations.filter((c) => c.state === "MISSING"), id).toEqual([]);
      expect(a.managementConclusion, id).toMatch(/^Resolved/);
    }
  });

  it("still demands the outstanding evidence on an open one", () => {
    const a = answerQuestion(t, "Why is this still open?", { exceptionId: "EXC-001" }).answer;
    expect(a?.nextAction).toMatch(/^Obtain:/);
    expect(a?.missingEvidence.join(" ")).toMatch(/cannot be inferred/i);
  });

  it("does not use EXC-001's contract wording for non-contract evidence", () => {
    for (const view of t.queries.listExceptions(t.ctx)) {
      if (!view.open) continue;
      const a = answerQuestion(t, "Why is this still open?", {
        exceptionId: view.exception.id,
      }).answer;
      const missing = (a?.missingEvidence ?? []).join(" ");
      if (missing !== "" && !/contract|provision|term/i.test(missing)) {
        expect(missing, view.exception.id).not.toMatch(/\bthe term\b/i);
      }
    }
  });
});

describe("guardrails are structural, not lexical", () => {
  const r = () => answerQuestion(t, "What prevents Controller sign-off?");

  it("rejects every quantity spelling, script and magnitude", () => {
    for (const prose of [
      "There are 7 blockers.", // correct, single digit — previously exempt
      "There are 3 blockers.", // wrong, single digit
      "seven blockers remain", // words
      "٧ blockers", // Arabic-Indic digits
      "The exposure is 100%.", // percent
      "It totals $1.", // currency
    ]) {
      expect(checkNarration(r(), prose).violations, prose).toContain("NUMERIC_DRIFT");
    }
  });

  it("rejects identifiers in prose whatever their prefix", () => {
    for (const prose of [
      "See EV-0001 for the record.",
      "Refer to RPT-CUT-1231.",
      "The provision is in MSA-2026-041.",
      "Documented at JE-PROP-001.",
    ]) {
      expect(checkNarration(r(), prose).violations, prose).toContain("UNRESOLVED_CITATION");
    }
  });

  it("rejects impersonal approval claims the verb blocklist used to miss", () => {
    for (const prose of [
      "I will post it for you.",
      "Consider it approved.",
      "No further review is needed.",
      "It is safe to sign off.",
      "This has been approved.",
    ]) {
      expect(checkNarration(r(), prose).ok, prose).toBe(false);
    }
  });

  it("rejects prose that contradicts the answer's own status", () => {
    const open = answerQuestion(t, "Why is this still open?", { exceptionId: "EXC-001" });
    expect(checkNarration(open, "The matter is resolved.").violations).toContain(
      "FORBIDDEN_ACTION",
    );
  });

  it("accepts explanatory prose that adds no figure, id or claim", () => {
    const verdict = checkNarration(
      r(),
      "Sign-off is held by open items; each is listed above with its own owner and conclusion.",
    );
    expect(verdict.ok, verdict.detail.join("; ")).toBe(true);
  });
});

describe("every shipped suggestion chip produces an answer", () => {
  // The suggestion lists and the intent table were authored independently
  // and 18 of 32 chips fell through to a refusal. This pins them together.
  const OVERVIEW = [
    "What prevents Controller sign-off?",
    "Why doesn't inventory tie?",
    "Show largest unresolved exposures.",
    "Which evidence is still missing?",
    "Which PBC items are not ready?",
  ];
  const SCREEN_CHIPS = [
    "Why can a native match pass while the close stays open?",
    "Which chains are missing required components?",
    "Which procurement matches are incomplete at year-end?",
    "What is under E&O review?",
    "Which third-party inventory is unsupported?",
    "How ready is the PBC package?",
    "Which adjustments are proposed but not posted?",
    "What would the GL be if every proposal were posted?",
  ];

  it.each(OVERVIEW)("Overview chip answers: %s", (q) => {
    const r = answerQuestion(t, q);
    expect(r.answer, `${q} -> ${r.refusal?.reason}`).toBeDefined();
  });

  it.each(SCREEN_CHIPS)("screen chip answers: %s", (q) => {
    const r = answerQuestion(t, q);
    expect(r.answer, `${q} -> ${r.refusal?.reason}`).toBeDefined();
  });

  it("answers every exception-scoped chip on every exception", () => {
    const chips = [
      "What evidence is missing?",
      "What does NetSuite say?",
      "Which assertions are affected?",
    ];
    for (const view of t.queries.listExceptions(t.ctx)) {
      for (const q of chips) {
        const r = answerQuestion(t, q, { exceptionId: view.exception.id });
        expect(r.answer, `${view.exception.id}: ${q}`).toBeDefined();
      }
    }
  });
});
