import { beforeAll, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createProjectionService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
} from "@icg/services";
import { answerQuestion, type AiToolContext } from "../src/index.js";

/**
 * The seven golden Ask Gaurd answers (CANONICAL_SPEC §13, prompts/code/08).
 *
 * No provider is configured anywhere in this file. That is the acceptance
 * test from prompts/code/08 ("Disable the AI provider. The deterministic
 * application and fallback must still support the primary demo") expressed
 * as the normal case rather than a fallback path: with no model in the
 * process, every golden question still answers.
 *
 * Figures are asserted in integer cents and basis points because that is what
 * the engine emits — apps/web formats them, so there is one place a
 * presentation change could break and it is not here.
 */

let t: AiToolContext;

const ctxFor = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-ASK-${role}`,
  sourceInterface: "ASK_GAURD",
});

beforeAll(() => {
  const ws = createWorkspace();
  t = {
    queries: createQueryService(ws),
    projections: createProjectionService(ws),
    ctx: ctxFor("CONTROLLER"),
  };
});

/** Every figure the answer carries, flattened for assertion. */
function figures(interaction: ReturnType<typeof answerQuestion>) {
  const a = interaction.answer;
  expect(a, `no answer for "${interaction.question}"`).toBeDefined();
  return [...a!.knownFacts, ...(a!.exposure !== undefined ? [a!.exposure] : [])];
}
const cents = (interaction: ReturnType<typeof answerQuestion>) =>
  figures(interaction).map((f) => f.valueCents).filter((v) => v !== undefined);
const counts = (interaction: ReturnType<typeof answerQuestion>) =>
  figures(interaction).map((f) => f.count).filter((v) => v !== undefined);
const bps = (interaction: ReturnType<typeof answerQuestion>) =>
  figures(interaction).map((f) => f.valueBps).filter((v) => v !== undefined);

describe("golden answers, with no AI provider in the process", () => {
  it("1. what prevents Controller sign-off? -> 7 blockers / $198,950", () => {
    const r = answerQuestion(t, "What prevents Controller sign-off?");
    expect(counts(r)).toContain(7);
    expect(r.answer?.exposure?.valueCents).toBe(19_895_000);
    expect(r.answer?.citations).toHaveLength(7);
    expect(r.mode).toBe("EXPLAIN");
    // Never a decision.
    expect(r.answer?.managementConclusion).not.toMatch(/I (approve|recommend approving)/i);
  });

  it("2. why is KE-E2-1048 open? -> Waiting on Contract / $14,800 / contract missing", () => {
    const r = answerQuestion(t, "Why is KE-E2-1048 still open?", { exceptionId: "EXC-001" });
    expect(r.answer?.status).toBe("WAITING_ON_CONTRACT");
    expect(r.answer?.exposure?.valueCents).toBe(1_480_000);
    // The refusal: the missing term is named as missing and not inferred.
    expect(r.answer?.missingEvidence.join(" ")).toMatch(/contract/i);
    expect(r.answer?.missingEvidence.join(" ")).toMatch(/cannot be inferred/i);
    expect(r.answer?.citations.some((c) => c.state === "MISSING")).toBe(true);
    expect(r.mode).toBe("INVESTIGATE");
  });

  it("3. does inventory tie? -> GL $4,812,450 / subledger $4,800,000 / difference $12,450", () => {
    const r = answerQuestion(t, "Does inventory tie to NetSuite?");
    expect(cents(r)).toEqual(expect.arrayContaining([481_245_000, 480_000_000, 1_245_000]));
    expect(r.answer?.status).toMatch(/^No —/);
  });

  it("4. which third-party inventory is unsupported? -> Redwood / 14 units / $92,400", () => {
    const r = answerQuestion(t, "Which third-party inventory is unsupported?");
    const facts = figures(r);
    const redwood = facts.filter((f) => f.label.startsWith("Redwood"));
    expect(redwood.length).toBeGreaterThan(0);
    expect(redwood.map((f) => f.count)).toContain(14);
    expect(redwood.map((f) => f.valueCents)).toContain(9_240_000);
    // The confirmed custodians are named too, so the answer cannot be read
    // as "all third-party stock is unsupported".
    expect(facts.some((f) => /confirmed/i.test(f.label))).toBe(true);
  });

  it("5. what is under E&O review? -> 20 KE-M1 / $27,000 / no reserve conclusion", () => {
    const r = answerQuestion(t, "What is under E&O review?");
    expect(counts(r)).toContain(20);
    expect(cents(r)).toContain(2_700_000);
    expect(r.answer?.status).toMatch(/UNDETERMINED/);
    // The $54,000 already on the GL is NOT this period's conclusion, and
    // must not appear as one.
    expect(cents(r)).not.toContain(5_400_000);
    expect(r.answer?.missingEvidence.join(" ")).toMatch(/No reserve amount is proposed/i);
  });

  it("6. how ready is the PBC package? -> 17/21 / 80.95%", () => {
    const r = answerQuestion(t, "How ready is the PBC package?");
    expect(counts(r)).toEqual(expect.arrayContaining([17, 21]));
    expect(bps(r)).toContain(8095);
    // Preparation, never acceptance.
    expect(r.answer?.managementConclusion).toMatch(/no state in this system records/i);
  });

  it("7. walk me through the financial life of KE-E2-1048 -> structured events only", () => {
    const r = answerQuestion(t, "Walk me through the financial life of KE-E2-1048", {
      serial: "KE-E2-1048",
    });
    const facts = figures(r);
    expect(facts.some((f) => f.label === "Sales Order")).toBe(true);
    expect(facts.some((f) => f.label === "Installation")).toBe(true);
    // Every event carries a real reference; none is invented or undated
    // without saying so.
    for (const f of facts.filter((x) => x.source === "get_evidence_timeline")) {
      expect(f.text).toBeTruthy();
    }
    expect(r.answer?.missingEvidence.length).toBeGreaterThan(0);
    expect(r.answer?.missingEvidence.join(" ")).toMatch(/no record exists/i);
  });
});

describe("every answer is derived, never authored", () => {
  it("sources every figure from a tool that was actually called", () => {
    for (const question of [
      "What prevents Controller sign-off?",
      "Does inventory tie?",
      "Which third-party inventory is unsupported?",
      "What is under E&O review?",
      "How ready is the PBC package?",
    ]) {
      const r = answerQuestion(t, question);
      const called = new Set(r.toolCalls.filter((c) => c.outcome === "OK").map((c) => c.tool));
      expect(called.size, question).toBeGreaterThan(0);
      for (const f of figures(r)) {
        expect(called.has(f.source), `${question}: ${f.label} cites an uncalled tool`).toBe(true);
      }
    }
  });

  it("records the toolset and answer-engine versions on every interaction", () => {
    const r = answerQuestion(t, "What prevents sign-off?");
    expect(r.versions.toolsetVersion).toMatch(/^ASK-GAURD-TOOLS-v/);
    expect(r.versions.answerEngineVersion).toMatch(/^ASK-GAURD-ANSWERS-v/);
    // No provider ran, so no provider is claimed.
    expect(r.versions.providerName).toBeUndefined();
    expect(r.narrationAvailable).toBe(false);
  });

  it("is reproducible: the same question over a fresh workspace answers identically", () => {
    const freshWs = createWorkspace();
    const fresh: AiToolContext = {
      queries: createQueryService(freshWs),
      projections: createProjectionService(freshWs),
      ctx: ctxFor("CONTROLLER"),
    };
    const a = answerQuestion(t, "What prevents Controller sign-off?");
    const b = answerQuestion(fresh, "What prevents Controller sign-off?");
    expect(JSON.stringify(b.answer)).toBe(JSON.stringify(a.answer));
  });
});

describe("questions it cannot answer say which kind of nothing that is", () => {
  it("refuses out of scope rather than guessing", () => {
    const r = answerQuestion(t, "What will Q1 revenue be?");
    expect(r.answer).toBeUndefined();
    expect(r.refusal?.reason).toBe("OUT_OF_SCOPE");
    expect(r.refusal?.message).toMatch(/will not guess/i);
  });

  it("reports an unknown object as unknown, not as empty", () => {
    const r = answerQuestion(t, "Why is this open?", { exceptionId: "EXC-999" });
    expect(r.refusal?.reason).toBe("NO_SUCH_OBJECT");
  });

  it("reports a restriction as a restriction, never as a zero", () => {
    // SYSTEM_ADMIN deliberately holds no accounting authority.
    const admin: AiToolContext = { ...t, ctx: ctxFor("SYSTEM_ADMIN") };
    const r = answerQuestion(admin, "What prevents Controller sign-off?");
    expect(r.answer).toBeUndefined();
    expect(r.refusal?.reason).toBe("NOT_AUTHORIZED");
    expect(r.refusal?.message).toMatch(/not a zero/i);
    expect(r.toolCalls.some((c) => c.outcome === "NOT_AUTHORIZED")).toBe(true);
  });
});
