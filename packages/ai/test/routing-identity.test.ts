import { beforeAll, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { INVENTORY_GL_ACCOUNTS, OFFSET_GL_ACCOUNTS } from "@icg/domain";
import {
  createProjectionService,
  createQueryService,
  createWorkspace,
  type ServiceContext,
} from "@icg/services";
import {
  AI_TOOL_NAMES,
  INTENT_KEYS,
  INTENT_MATCHES,
  answerQuestion,
  intentPhrases,
  normalizeQuestion,
  phrasePattern,
  routeQuestion,
  runTool,
  type AiToolContext,
} from "../src/index.js";

/**
 * The routing-identity harness (COMPLETION_PLAN Stage G).
 *
 * COMPLETION_PLAN §3.9 blocked roughly ten new intents on this file existing.
 * The reason is arithmetic: intent order IS the disambiguation, the first
 * match wins, and every intent added to an unanchored table makes the next
 * mis-route less visible. Before Stage G, `/count/` claimed "GL **ac**count
 * 1200" and "**ac**counting impact of SO-26184" — two general-ledger
 * questions answered by the physical-count handler, in a product whose whole
 * claim is that its answers are traceable.
 *
 * So this file asserts three different things, and the difference matters:
 *
 * 1. **A property over every phrase in the table** — no phrase may match
 *    inside a longer word. That one is universal and mechanical: it holds for
 *    phrases nobody thought to write a probe for, including phrases added
 *    after this file was last read.
 * 2. **Identity for a probe per intent** — WHICH handler a question reaches,
 *    not merely that it reaches one. A count is satisfied by the wrong set of
 *    the right size.
 * 3. **Reachability over the whole table** — every intent is the answer to
 *    some probe, so an intent added without a probe fails here rather than
 *    shipping unrouted.
 */

let t: AiToolContext;

/**
 * Bare four-digit runs that are not a GL account code. The codes come from
 * the chart of accounts in @icg/domain rather than from a list here: a bare
 * `1200` is an account, a bare `1500` is a count, and only the chart knows
 * which is which.
 */
const ACCOUNT_CODES = new Set(
  [...INVENTORY_GL_ACCOUNTS, ...OFFSET_GL_ACCOUNTS].map((a) => a.code),
);
const ungroupedCounts = (sentence: string): readonly string[] =>
  (sentence.match(/(?<![\w.,-])\d{4,}(?![\w.-])/g) ?? []).filter(
    (digits) => !ACCOUNT_CODES.has(digits),
  );

const ctx = (): ServiceContext => ({
  user: userByRole("CONTROLLER"),
  correlationId: "T-ROUTE",
  sourceInterface: "ASK_GAURD",
});

beforeAll(() => {
  const ws = createWorkspace();
  t = {
    queries: createQueryService(ws),
    projections: createProjectionService(ws),
    ctx: ctx(),
  };
});

/**
 * One probe per intent, in table order.
 *
 * Each is a question a reader would actually type — not a keyword — because a
 * probe made of the intent's own phrases proves only that the phrase list
 * matches itself. The `scope` field is the screen state, when the intent
 * needs one.
 */
const PROBES: readonly {
  readonly q: string;
  readonly intent: string;
  readonly scope?: { exceptionId?: string; serial?: string };
}[] = [
  { q: "Draft the close memo for me.", intent: "memo-draft" },
  { q: "What must management conclude before the period can close?", intent: "memo-draft" },
  { q: "Why is close readiness where it is?", intent: "readiness-explained" },
  {
    q: "Which parts of this product are judgements rather than derivations?",
    intent: "judgements",
  },
  { q: "Where did this workpaper's numbers come from?", intent: "provenance" },
  { q: "Which GL account is out?", intent: "gl-accounts" },
  { q: "What is sitting in GL account 1200?", intent: "gl-accounts" },
  { q: "What have we received but not been invoiced for?", intent: "grni" },
  {
    q: "Which purchase orders were billed but not received at year-end?",
    intent: "invoiced-not-received",
  },
  { q: "Is there any purchase price variance this year?", intent: "price-variance" },
  { q: "What makes up the standard cost of a unit?", intent: "cost-stack" },
  {
    q: "Which costs did we keep out of inventory this year, and why?",
    intent: "cost-classification",
  },
  { q: "Has the cost of everything we sold left the book?", intent: "cogs-relief" },
  { q: "What is the accounting impact of SO-26184?", intent: "cogs-relief" },
  { q: "What did we dispose of this year, and what did we get back?", intent: "disposition" },
  { q: "Is any stock on our floor owned by somebody else?", intent: "consignment" },
  { q: "Which third-party inventory is unsupported?", intent: "third-party" },
  { q: "Who is holding our inventory that we do not hold ourselves?", intent: "custody" },
  { q: "Which stock has not moved in a year?", intent: "eo-aging" },
  { q: "Has a reserve been concluded?", intent: "valuation" },
  { q: "Show me the journal entry lines.", intent: "journal-entry" },
  { q: "Which adjustments are proposed but not posted?", intent: "adjustments" },
  { q: "Which chains are missing required components?", intent: "procurement-chain" },
  { q: "Does inventory tie to the GL?", intent: "reconciliation" },
  { q: "How ready is the PBC package?", intent: "pbc" },
  { q: "Which sources are not healthy?", intent: "source-health" },
  { q: "What supports EXC-001?", intent: "evidence-support" },
  { q: "Which evidence is still missing?", intent: "missing-evidence" },
  { q: "Which exceptions are resolved?", intent: "resolved-exceptions" },
  { q: "Which serials have open exceptions?", intent: "serials-with-exceptions" },
  { q: "What conflicts at year-end?", intent: "unit-conflicts", scope: { serial: "KE-E2-1048" } },
  { q: "What should I work on first?", intent: "work-priority" },
  { q: "Show largest unresolved exposures.", intent: "largest-exposures" },
  { q: "What prevents Controller sign-off?", intent: "blockers" },
  { q: "What caused the first-pass variances?", intent: "counts" },
  {
    q: "Walk me through this unit's financial life.",
    intent: "financial-life",
    scope: { serial: "KE-E2-1048" },
  },
  // The object-scoped branch, which outranks the whole table.
  {
    q: "Why is KE-E2-1048 still open?",
    intent: "exception-detail",
    scope: { exceptionId: "EXC-001" },
  },
];

describe("every phrase is a whole word, by construction", () => {
  /**
   * The §3.9 defect class as a universal.
   *
   * `\b` is added by `phrasePattern`, so an author cannot leave it off — but
   * "cannot leave it off" is a claim about a compiler, and this is the
   * assertion that the compiler does what the claim says, over every phrase
   * the table actually contains rather than over an example.
   */
  const phrases = INTENT_MATCHES.flatMap((i) =>
    intentPhrases(i.match).map((phrase) => ({ key: i.key, phrase })),
  );

  it("has phrases to check", () => {
    // Without this, a table that failed to export would make every
    // assertion below iterate an empty list and report success.
    expect(phrases.length).toBeGreaterThan(150);
    expect(new Set(phrases.map((p) => p.key)).size).toBe(INTENT_MATCHES.length);
  });

  it.each(phrases)("$key: '$phrase' never matches inside a longer word", ({ phrase }) => {
    const literal = phrase.endsWith("*") ? phrase.slice(0, -1) : phrase;
    const pattern = phrasePattern(phrase);
    // The phrase alone must match — otherwise the negative below proves
    // nothing, which is how a broken pattern passes a boundary test.
    expect(pattern.test(literal), `${phrase} does not match itself`).toBe(true);
    expect(pattern.test(`prefixed${literal}`), `${phrase} matched a longer word`).toBe(false);
  });

  it("a non-stem phrase does not match a longer word on the right either", () => {
    const closed = INTENT_MATCHES.flatMap((i) => intentPhrases(i.match)).filter(
      (p) => !p.endsWith("*"),
    );
    expect(closed.length).toBeGreaterThan(100);
    for (const phrase of closed) {
      expect(phrasePattern(phrase).test(`${phrase}ness`), `${phrase} matched a suffix`).toBe(
        false,
      );
    }
  });

  it("is written in the case it matches in", () => {
    // The matcher lower-cases the question; a phrase authored with a capital
    // would silently never fire, and nothing else in the file would say so.
    for (const { key, phrase } of phrases) {
      expect(phrase, `${key} phrase is not lower case`).toBe(phrase.toLowerCase());
    }
  });
});

describe("the mis-routes COMPLETION_PLAN §3.9 names", () => {
  it("does not send 'GL account 1200' to the physical-count handler", () => {
    expect(routeQuestion("What is sitting in GL account 1200?")?.key).toBe("gl-accounts");
  });

  it("does not send 'accounting impact of SO-26184' to the physical-count handler", () => {
    const route = routeQuestion("What is the accounting impact of SO-26184?");
    expect(route?.key).not.toBe("counts");
    expect(route?.key).toBe("cogs-relief");
  });

  it("still sends a real count question to the count handler", () => {
    // The other half of the fix. A boundary that routed nothing anywhere
    // would satisfy both assertions above.
    expect(routeQuestion("What caused the first-pass variances?")?.key).toBe("counts");
    expect(routeQuestion("Which count issues are still open?")?.key).toBe("counts");
  });

  it("answers 'what should I work on first?' instead of refusing it", () => {
    // §3.9's other named defect: the most natural controller question
    // returned OUT_OF_SCOPE while the data for it existed.
    const r = answerQuestion(t, "What should I work on first?");
    expect(r.answer, r.refusal?.reason).toBeDefined();
    expect(r.route).toBe("work-priority");
  });
});

describe("routing identity", () => {
  it.each(PROBES)("$q -> $intent", ({ q, intent, scope }) => {
    const r = answerQuestion(t, q, scope ?? {});
    expect(r.answer, `${q} refused with ${r.refusal?.reason}`).toBeDefined();
    expect(r.route).toBe(intent);
  });

  it.each(PROBES)("$intent sources every figure from a tool it called", ({ q, scope }) => {
    /**
     * The stage-08 version of this check ran over five questions. It is the
     * property that makes "no figure comes from anywhere else" true rather
     * than intended, so it runs over the whole probe table — which the
     * reachability test above proves covers every intent.
     */
    const r = answerQuestion(t, q, scope ?? {});
    const called = new Set(r.toolCalls.filter((c) => c.outcome === "OK").map((c) => c.tool));
    const figures = [
      ...(r.answer?.knownFacts ?? []),
      ...(r.answer?.exposure !== undefined ? [r.answer.exposure] : []),
    ];
    expect(figures.length, `${q} produced no figures`).toBeGreaterThan(0);
    for (const f of figures) {
      expect(called.has(f.source), `${q}: "${f.label}" cites the uncalled ${f.source}`).toBe(
        true,
      );
    }
  });

  it.each(PROBES)("$intent groups every count it writes into a sentence", ({ q, scope }) => {
    /**
     * Structured figures are formatted by apps/web. Sentences are composed by
     * the engine, and `${bookUnits}` put "1500 book units" in the drawer
     * beside a screen showing "1,500" — one value, two spellings, on one
     * screen.
     *
     * The pattern excludes any digit run touching a letter, a hyphen or a
     * dot, so identifiers (`PO-26-3029`), fiscal years (`FY2026`) and ISO
     * dates (`2026-11-20`) are left alone. GL account codes are bare
     * four-digit numbers that must NOT be grouped — `1200`, never `1,200` —
     * so they are excluded from the chart of accounts itself rather than
     * listed here, where a sixth account would silently start failing.
     */
    const r = answerQuestion(t, q, scope ?? {});
    const sentences = [
      r.answer?.status ?? "",
      r.answer?.managementConclusion ?? "",
      r.answer?.nextAction ?? "",
      ...(r.answer?.conflictingEvidence ?? []),
      ...(r.answer?.missingEvidence ?? []),
      ...(r.answer?.knownFacts ?? []).map((f) => f.label),
    ];
    for (const sentence of sentences) {
      expect(ungroupedCounts(sentence), `ungrouped count in: "${sentence}"`).toEqual([]);
    }
  });

  it("would catch an ungrouped count if one were there", () => {
    // The pattern above proves nothing unless it fires on the shape it names,
    // and the account-code exclusion proves nothing unless it is doing work.
    expect(ungroupedCounts("1500 book units")).toEqual(["1500"]);
    expect(ungroupedCounts("1,500 book units")).toEqual([]);
    expect(ungroupedCounts("PO-26-3029 and FY2026 and 2026-11-20")).toEqual([]);
    expect(ungroupedCounts("1200 Inventory — Finished / Other")).toEqual([]);
  });

  it("reaches every intent in the table", () => {
    // Reachability, not coverage-by-count: an intent nothing routes to is
    // dead code that reads as a shipped capability.
    const reached = new Set(PROBES.map((p) => p.intent));
    const unreached = INTENT_KEYS.filter((k) => !reached.has(k));
    expect(unreached, "intents no probe reaches").toEqual([]);
  });

  it("names only intents that exist", () => {
    const known = new Set([...INTENT_KEYS, "exception-detail", "unit-detail"]);
    for (const p of PROBES) expect(known.has(p.intent), `${p.intent} is not an intent`).toBe(true);
  });

  it("routes each probe to exactly the intent its own entry names", () => {
    /**
     * The bijection. Every probe is put to the WHOLE table, so a new intent
     * that shadows an existing one fails here rather than quietly stealing
     * that intent's questions — which is the failure mode ordering has.
     */
    for (const p of PROBES) {
      if (p.intent === "exception-detail") continue;
      expect(routeQuestion(p.q)?.key, `${p.q} routed away from ${p.intent}`).toBe(p.intent);
    }
  });
});

describe("normalisation", () => {
  it("routes a curly-quoted question exactly like its typewriter twin", () => {
    // The folding table in matching.ts is written with the curly characters
    // themselves. A Windows re-encoding mojibakes them, and folding then
    // stops silently — this is what makes that loud.
    expect(routeQuestion("Why doesn’t inventory tie?")?.key).toBe(
      routeQuestion("Why doesn't inventory tie?")?.key,
    );
    expect(normalizeQuestion("Why doesn’t it tie—still?")).toBe(
      "why doesn't it tie-still?",
    );
  });

  it("matches a phrase written with a space against a hyphenated question", () => {
    expect(routeQuestion("What prevents sign-off?")?.key).toBe("blockers");
    expect(routeQuestion("What prevents sign off?")?.key).toBe("blockers");
  });
});

describe("the tool surface", () => {
  /**
   * A name in `AI_TOOL_NAMES` with no handler is a compile error. A handler
   * that throws at runtime is not, and Stage G added eleven of them at once
   * — so every tool is actually run here, over the whole list rather than
   * over the ones the intents happen to call.
   */
  it.each([...AI_TOOL_NAMES])("%s runs and reports an outcome", (tool) => {
    const result = runTool(t, tool, { exceptionId: "EXC-001", serial: "KE-E2-1048" });
    expect(result.call.outcome, `${tool} was denied to a Controller`).toBe("OK");
    expect(result.data, `${tool} returned no payload`).toBeDefined();
  });

  it("denies every tool to a role without close.read, rather than emptying it", () => {
    // SYSTEM_ADMIN holds no accounting authority. A tool that returned an
    // empty payload instead of NOT_AUTHORIZED would render a restriction as
    // a zero on every screen that consumed it.
    const ws = createWorkspace();
    const admin: AiToolContext = {
      queries: createQueryService(ws),
      projections: createProjectionService(ws),
      ctx: {
        user: userByRole("SYSTEM_ADMIN"),
        correlationId: "T-ROUTE-ADMIN",
        sourceInterface: "ASK_GAURD",
      },
    };
    for (const tool of AI_TOOL_NAMES) {
      const result = runTool(admin, tool, { exceptionId: "EXC-001", serial: "KE-E2-1048" });
      expect(result.call.outcome, `${tool} did not refuse an unauthorized role`).toBe(
        "NOT_AUTHORIZED",
      );
    }
  });
});
