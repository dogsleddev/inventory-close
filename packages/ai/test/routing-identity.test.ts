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
  numberForms,
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
  /** Non-stem phrases: a stem's `[a-z]*` tail answers these questions itself. */
  const closedPhraseRows = phrases.filter((p) => !p.phrase.endsWith("*"));

  it("has phrases to check", () => {
    // Without this, a table that failed to export would make every
    // assertion below iterate an empty list and report success.
    expect(phrases.length).toBeGreaterThan(150);
    expect(new Set(phrases.map((p) => p.key)).size).toBe(INTENT_MATCHES.length);
  });

  it.each(phrases)("$key: '$phrase' never matches inside a longer word", ({ phrase }) => {
    // Normalized, because that is the form the pattern is compiled from and the
    // form a question arrives in. Testing the raw phrase would make this
    // assertion fail on an encoding problem and report it as a boundary one;
    // encoding is the ASCII assertion's job, below.
    const literal = normalizeQuestion(phrase.endsWith("*") ? phrase.slice(0, -1) : phrase);
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

  /**
   * Every assertion above is SELF-REFERENTIAL: it tests a compiled pattern
   * against the phrase that compiled it. That is the right shape for a boundary
   * property and the wrong shape for an encoding one — all of them pass on a
   * phrase that matches nothing a reader can type.
   *
   * The table's only apostrophe phrase is `hasn't moved`. Authored with a curly
   * apostrophe, or mojibaked to `hasnâ€™t` by a Get-Content/Set-Content round
   * trip on Windows, it compiles to a pattern no normalized question reaches —
   * and the whole suite stays green, because each assertion folds the same
   * corruption into both sides.
   *
   * `phrasePattern` now folds the phrase through `normalizeQuestion`, so a
   * curly apostrophe survives. Folding cannot undo mojibake, though: `â€™` is
   * not a character the fold set knows. So the guard is ASCII.
   */
  it("declares every phrase in ASCII, so a re-encoding fails here", () => {
    for (const { key, phrase } of phrases) {
      const offending = [...phrase].filter((ch) => ch.charCodeAt(0) > 127);
      expect(
        offending,
        `${key} phrase "${phrase}" carries non-ASCII ${offending.map((c) => `U+${c.charCodeAt(0).toString(16)}`).join(" ")} — a curly character authored by hand, or a mojibaked file`,
      ).toEqual([]);
    }
  });

  it("routes a real question carrying a curly apostrophe", () => {
    // Non-self-referential: a READER's question, built from char codes so no
    // encoding in this file can flatter the result, against the shipped table.
    const curly = String.fromCharCode(0x2019);
    expect(routeQuestion(`What hasn${curly}t moved in a year?`)?.key).toBe("eo-aging");
    expect(routeQuestion("What hasn't moved in a year?")?.key).toBe("eo-aging");
  });

  /**
   * Hyphen and space are one spelling, in both directions.
   *
   * The join was `[\s-]+` and the split was `\s+`, so the property held one way
   * only: an authored SPACE matched a hyphen, an authored HYPHEN matched
   * nothing else. "What is in the sub-ledger?" answered and "What is in the sub
   * ledger?" refused. Seven other hyphenated phrases looked fine only because
   * an author had hand-listed the spaced twin — the allowlist standing in for
   * the property, which is what number agreement had just been moved off.
   */
  it.each(closedPhraseRows)("$key: '$phrase' matches hyphenated and spaced alike", ({ phrase }) => {
    const pattern = phrasePattern(phrase);
    const literal = normalizeQuestion(phrase);
    const spaced = literal.replace(/-/g, " ");
    const hyphenated = literal.replace(/\s+/g, "-");
    expect(pattern.test(spaced), `${phrase} does not match "${spaced}"`).toBe(true);
    expect(pattern.test(hyphenated), `${phrase} does not match "${hyphenated}"`).toBe(true);
  });

  it("reaches the intent for a phrase a reader spaced out", () => {
    expect(routeQuestion("What is in the sub ledger?")?.key).toBe("reconciliation");
    expect(routeQuestion("What is in the sub-ledger?")?.key).toBe("reconciliation");
    expect(routeQuestion("Show me the three way match.")?.key).toBe("procurement-chain");
  });
});

/**
 * Number agreement, which was the second `\b`.
 *
 * §3.9's defect was a boundary an author had to remember to type. This is the
 * same shape one property over: a phrase held for the number it was written in
 * and refused the other, and whether it held was invisible in a diff. A census
 * over the shipped table found 36 phrases declared in both numbers and 198 in
 * one — so the table's own coverage of English was a hand-maintained
 * allowlist, and an allowlist standing in for a category is exactly what §3.9
 * closed on the boundary axis.
 *
 * The three assertions below are deliberately different in kind. The first
 * pins the inflection rule against hand-written English, so it cannot drift
 * into agreeing with whatever the implementation happens to do. The second
 * checks the compiler actually APPLIES that rule, over every phrase in the
 * table including ones added after this file was last read. The third is
 * reader-facing identity: the questions the Stage G review found refusing or
 * answering from the wrong handler.
 */
describe("number agreement is compiled, not declared", () => {
  it("inflects regular nouns the way English does", () => {
    // Hand-written, and NOT derived from the implementation: a test that
    // recomputed the rule would agree with a broken rule.
    const expected: Record<string, readonly string[]> = {
      account: ["accounts", "account"],
      accounts: ["accounts", "account"],
      variance: ["variances", "variance"],
      variances: ["variances", "variance"],
      liability: ["liabilities", "liability"],
      liabilities: ["liabilities", "liability"],
      confirmation: ["confirmations", "confirmation"],
      disposal: ["disposals", "disposal"],
      weightings: ["weightings", "weighting"],
      match: ["matches", "match"],
      matches: ["matches", "match"],
    };
    for (const [word, forms] of Object.entries(expected)) {
      expect([...numberForms(word)].sort(), word).toEqual([...forms].sort());
    }
  });

  const closedPhrases = INTENT_MATCHES.flatMap((i) =>
    intentPhrases(i.match)
      .filter((phrase) => !phrase.endsWith("*"))
      .map((phrase) => ({ key: i.key, phrase })),
  );

  it.each(closedPhrases)("$key: '$phrase' matches in both numbers", ({ phrase }) => {
    const pattern = phrasePattern(phrase);
    // Segmented the way the compiler segments — on `[\s-]+`, so the head of
    // "sub-ledger" is "ledger" here as it is there. Splitting on whitespace
    // alone would inflect "sub-ledger" whole and assert a form the compiler
    // never produces.
    const words = normalizeQuestion(phrase).split(/[\s-]+/);
    const head = words[words.length - 1]!;
    for (const form of numberForms(head)) {
      const written = [...words.slice(0, -1), form].join(" ");
      expect(pattern.test(written), `${phrase} does not match "${written}"`).toBe(true);
    }
  });

  /**
   * One entry per finding. `want` is the intent whose handler is written for
   * the question, and the other number of every one of these already reached
   * it — which is what makes each a defect rather than an unsupported topic.
   */
  const READER_QUESTIONS: readonly { q: string; want: string; finding: string }[] = [
    { q: "What purchase price variances did we have this year?", want: "price-variance", finding: "G40" },
    { q: "Which price variances are largest?", want: "price-variance", finding: "G40" },
    { q: "Are all third-party confirmations in?", want: "third-party", finding: "G39" },
    { q: "Which custodian confirmations are outstanding?", want: "third-party", finding: "G39" },
    { q: "Which accounts are out?", want: "gl-accounts", finding: "G42" },
    { q: "What accruals are needed at year-end?", want: "grni", finding: "G42" },
    { q: "What accrued liabilities are we carrying at year-end?", want: "grni", finding: "G42" },
    { q: "What are the standard costs?", want: "cost-stack", finding: "G42" },
    { q: "Which disposals happened this year?", want: "disposition", finding: "G42" },
    { q: "What consignments are on our floor?", want: "consignment", finding: "G42" },
    { q: "Which serials have an exception?", want: "serials-with-exceptions", finding: "G42" },
    { q: "Which purchase orders are missing required components?", want: "procurement-chain", finding: "G42" },
    { q: "What weighting does evidence carry?", want: "readiness-explained", finding: "G42" },
    { q: "What write-downs were taken?", want: "valuation", finding: "G42" },
  ];

  it.each(READER_QUESTIONS)("$finding: '$q' reaches $want", ({ q, want }) => {
    expect(routeQuestion(q)?.key).toBe(want);
  });

  /**
   * The other direction. Every one of these answered before number agreement
   * was compiled in, and a change that widened the table until an earlier
   * intent swallowed them would satisfy the block above and break the product.
   *
   * The last three matter most: `counts` legitimately owns the bare plural
   * "variances" — its own §3.9 regression probe is "What caused the first-pass
   * variances?" — so the price-variance repair had to work by making
   * price-variance MATCH, not by taking a word away from counts.
   */
  const UNMOVED: readonly { q: string; want: string }[] = [
    { q: "Which GL account is out?", want: "gl-accounts" },
    { q: "Is the third-party confirmation in?", want: "third-party" },
    { q: "Which accrual have we recorded?", want: "grni" },
    { q: "What makes up the standard cost of a unit?", want: "cost-stack" },
    { q: "Which disposal happened this year?", want: "disposition" },
    { q: "What consignment stock is on our floor?", want: "consignment" },
    { q: "Which serials have open exceptions?", want: "serials-with-exceptions" },
    { q: "Which purchase order is missing a required component?", want: "procurement-chain" },
    { q: "What are the weightings?", want: "readiness-explained" },
    { q: "Has a reserve been concluded?", want: "valuation" },
    { q: "What caused the first-pass variances?", want: "counts" },
    { q: "Which count issues are still open?", want: "counts" },
    { q: "Is there any purchase price variance this year?", want: "price-variance" },
  ];

  it.each(UNMOVED)("'$q' still reaches $want", ({ q, want }) => {
    expect(routeQuestion(q)?.key).toBe(want);
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
     *
     * This is a NECESSARY condition and not the property `AiFigure.source`
     * documents. It asserts membership in the set of tools the interaction
     * ran, and 28 of the 34 probes call exactly one tool, so it has content on
     * six — where it passed over two intents citing the wrong one of the two
     * tools they called. The identity check is the test below.
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

  /**
   * Figure provenance, by identity rather than by membership.
   *
   * `AiFigure.source` is documented as "the tool this figure came from — makes
   * drift auditable", and the drawer prints it as "Answered from …". The test
   * above cannot see the difference between that and "a tool this answer
   * happened to call", and two intents were citing the wrong one: `pbc`
   * declared `get_pbc_status` on two counts it read from
   * `readiness.aggregates`, and `blockers` declared `get_blocking_conditions`
   * on a count and on its exposure figure, read from the same place. A drift
   * audit run against those citations would have agreed with itself.
   *
   * So each called tool's output is perturbed in turn and the figures are
   * diffed. The assertion is the defect's exact signature: a figure citing
   * tool S that does NOT move when S moves, but DOES move when another tool
   * this same answer called moves. That figure demonstrably tracks the other
   * tool, whatever it says. The tool's service methods are discovered by
   * running the real handler through a recording proxy, so nothing here
   * restates the `HANDLERS` table — a tool added later is covered without this
   * test being edited.
   *
   * The weaker form — "a figure citing S must move when S moves" — was tried
   * first and reported two figures that were sourced correctly. `count:
   * matches.filter(m => m.closeMatchStatus !== "PASS").length` does not move
   * when the numbers inside those matches move, and no perturbation of a
   * result can be relied on to move an arbitrary derived count. A figure that
   * moves with nothing is not evidence of anything, and this test now says so
   * by staying silent about it rather than by failing.
   *
   * One further limit, honestly: where two tools share a service method (both
   * financial-lifecycle tools read `getFinancialLife`) perturbing one moves the
   * other, which can only hide a defect, never invent one.
   */
  const DELTA = 7_000_003;

  const perturb = (value: unknown): unknown => {
    if (typeof value === "number") return Number.isInteger(value) ? value + DELTA : value;
    if (Array.isArray(value)) {
      // Lengths move as well as numbers. Many figures are `rows.length`, and a
      // perturbation that only touched the numbers INSIDE a row left every
      // count of rows unmoved — which reads exactly like a figure sourced
      // elsewhere. The last element is duplicated rather than removed so no
      // handler loses a row it indexes.
      const mapped = value.map(perturb);
      return value.length > 0 ? [...mapped, mapped[mapped.length - 1]] : mapped;
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, perturb(v)]),
      );
    }
    return value;
  };

  /** Wrap a service object, optionally transforming the result of named methods. */
  const wrap = <T extends object>(
    target: T,
    onCall: (method: string) => void,
    transform: ReadonlySet<string> | null,
  ): T =>
    new Proxy(target, {
      get(obj, prop) {
        const value = (obj as Record<string | symbol, unknown>)[prop];
        if (typeof value !== "function") return value;
        const fn = value as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => {
          onCall(String(prop));
          const out = fn.apply(obj, args);
          return transform?.has(String(prop)) === true ? perturb(out) : out;
        };
      },
    }) as T;

  /** Which service methods each tool actually reaches, from the real handlers. */
  const methodsByTool = new Map<string, ReadonlySet<string>>();
  beforeAll(() => {
    for (const tool of AI_TOOL_NAMES) {
      const seen = new Set<string>();
      const record = (m: string) => seen.add(m);
      const probe: AiToolContext = {
        queries: wrap(t.queries, record, null),
        projections: wrap(t.projections, record, null),
        ctx: t.ctx,
      };
      // Args every id-taking tool accepts; a tool that needs none ignores them.
      runTool(probe, tool, { exceptionId: "EXC-001", serial: "KE-E2-1048" });
      methodsByTool.set(tool, seen);
    }
  });

  const numberOf = (f: {
    count?: number | undefined;
    valueCents?: number | undefined;
    valueBps?: number | undefined;
  }): number | undefined => f.count ?? f.valueCents ?? f.valueBps;

  it.each(PROBES)("$intent reads every figure from the tool it cites", ({ q, scope }) => {
    const baseline = answerQuestion(t, q, scope ?? {});
    const called = [
      ...new Set(baseline.toolCalls.filter((c) => c.outcome === "OK").map((c) => c.tool)),
    ];
    // With one tool called, the citation cannot name anything else and there is
    // nothing to distinguish. The intents this test exists for call two.
    if (called.length < 2) return;

    const figuresOf = (r: typeof baseline) =>
      new Map(
        [
          ...(r.answer?.knownFacts ?? []),
          ...(r.answer?.exposure !== undefined ? [r.answer.exposure] : []),
        ]
          .filter((f) => numberOf(f) !== undefined)
          .map((f) => [`${f.source}|${f.label}`, numberOf(f) as number]),
      );

    const before = figuresOf(baseline);

    /** Per called tool: the figures whose value moved when only that tool moved. */
    const movedBy = new Map<string, ReadonlySet<string>>();
    for (const tool of called) {
      const methods = methodsByTool.get(tool);
      expect(methods, `no service method recorded for ${tool}`).toBeDefined();
      const shifted: AiToolContext = {
        queries: wrap(t.queries, () => {}, methods as ReadonlySet<string>),
        projections: wrap(t.projections, () => {}, methods as ReadonlySet<string>),
        ctx: t.ctx,
      };
      let after: Map<string, number>;
      try {
        after = figuresOf(answerQuestion(shifted, q, scope ?? {}));
      } catch {
        // Perturbed numbers can drive an intent down a branch that throws.
        // Inconclusive for this tool; it contributes no evidence either way.
        continue;
      }
      movedBy.set(
        tool,
        new Set([...before].filter(([k, v]) => after.has(k) && after.get(k) !== v).map(([k]) => k)),
      );
    }

    for (const key of before.keys()) {
      const cited = key.split("|")[0] as string;
      if (movedBy.get(cited)?.has(key) === true) continue; // moves with what it cites
      const tracks = called.filter((tool) => tool !== cited && movedBy.get(tool)?.has(key) === true);
      expect(
        tracks,
        `${q}: "${key}" cites ${cited} but its value moved with ${tracks.join(", ")} instead`,
      ).toEqual([]);
    }
  });

  it("would catch a figure citing the wrong tool of two", () => {
    // The guard above is only as good as its power to fail, and it must fail
    // on the exact shape just fixed: a multi-tool intent whose figure cites
    // the tool it did NOT read from.
    const r = answerQuestion(t, "How ready is the PBC package?", {});
    const called = new Set(r.toolCalls.filter((c) => c.outcome === "OK").map((c) => c.tool));
    expect(called).toEqual(new Set(["get_close_readiness", "get_pbc_status"]));
    const readiness = methodsByTool.get("get_close_readiness") as ReadonlySet<string>;
    const pbc = methodsByTool.get("get_pbc_status") as ReadonlySet<string>;
    // The two tools must not share a service method, or perturbing one would
    // move the other's figures and the check would pass on either citation.
    expect([...readiness].filter((m) => pbc.has(m))).toEqual([]);
    const ready = r.answer?.knownFacts.find((f) => f.label === "Ready or provided");
    expect(ready?.source).toBe("get_close_readiness");
    // Perturbing the tool it does NOT cite must leave it alone.
    const moved: AiToolContext = {
      queries: wrap(t.queries, () => {}, pbc),
      projections: wrap(t.projections, () => {}, pbc),
      ctx: t.ctx,
    };
    const after = answerQuestion(moved, "How ready is the PBC package?", {});
    expect(after.answer?.knownFacts.find((f) => f.label === "Ready or provided")?.count).toBe(
      ready?.count,
    );
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
