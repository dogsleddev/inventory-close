import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_USERS, userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createProjectionService,
  createQueryService,
  createWorkspace,
  type ProcurementPopulationsOut,
  type ServiceContext,
  type Workspace,
} from "@icg/services";
import {
  answerQuestion,
  checkDraft,
  namesRecordIdentifier,
  statesQuantity,
  type AiToolContext,
} from "../src/index.js";

/**
 * Stage G regressions.
 *
 * Written as CATEGORIES rather than instances, following the stage-08
 * review's sharpest criticism of its own tests: "each gap is the shape of a
 * test that asserts an instance where the contract states a category". Where
 * a sentence in an answer branches on a boolean the service measured, the
 * assertion here is the BICONDITIONAL — the sentence and the measurement are
 * read on the same run and required to agree. A test that pinned the phrase
 * would pass forever once the data moved underneath it, which is precisely
 * how the Stage F review found authored prose describing a population of
 * zero.
 */

let ws: Workspace;
let t: AiToolContext;
let auditor: AiToolContext;

const ctxFor = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-G-${role}`,
  sourceInterface: "ASK_GAURD",
});

const contextFor = (role: Role): AiToolContext => ({
  queries: createQueryService(ws),
  projections: createProjectionService(ws),
  ctx: ctxFor(role),
});

beforeAll(() => {
  ws = createWorkspace();
  t = contextFor("CONTROLLER");
  auditor = contextFor("AUDITOR_READ_ONLY");
});

describe("Draft mode produces wording, never figures", () => {
  const draftOf = () => answerQuestion(t, "Draft the close memo for me.").answer?.draft ?? [];

  it("produces sections at all", () => {
    // Without this, every assertion below iterates an empty list and the
    // whole describe block reports success having checked nothing.
    expect(draftOf().length).toBeGreaterThan(3);
  });

  it("states no quantity in any section", () => {
    /**
     * The SAME function `checkNarration` applies to provider prose, not a
     * second copy of its patterns. Five guardrail bypasses in stage 08 came
     * from trying to decide whether a number in prose was the right number;
     * that comparison is not reliably decidable, so Draft does not attempt
     * it either — and it cannot drift away from the narration rule, because
     * there is only the one rule.
     */
    for (const section of draftOf()) {
      expect(statesQuantity(section.body), `"${section.heading}" states a quantity`).toBe(false);
      expect(statesQuantity(section.heading), `heading "${section.heading}"`).toBe(false);
    }
  });

  it("names no record identifier in any section", () => {
    for (const section of draftOf()) {
      expect(
        namesRecordIdentifier(section.body),
        `"${section.heading}" names an identifier`,
      ).toBe(false);
    }
  });

  it("carries the close position as STRUCTURED figures beside the wording", () => {
    // The complement of the rule above: the wording refuses figures because
    // the figures travel structurally, not because the answer has none.
    const answer = answerQuestion(t, "Draft the close memo for me.").answer;
    expect(answer?.knownFacts.some((f) => f.valueCents !== undefined)).toBe(true);
    expect(answer?.knownFacts.some((f) => f.valueBps !== undefined)).toBe(true);
  });

  it("no other intent emits a draft", () => {
    // Draft is a mode, not a decoration. An intent that started returning
    // wording would be prose nothing checks.
    for (const q of [
      "What prevents Controller sign-off?",
      "Does inventory tie to the GL?",
      "Which stock has not moved in a year?",
    ]) {
      expect(answerQuestion(t, q).answer?.draft ?? []).toEqual([]);
    }
  });
});

describe("the drafting offer carries every gate the command carries", () => {
  /** The control the Close Memo screen actually shows a drafter. */
  const AFFORDANCE = "Start from the close position";

  it("offers drafting to exactly the roles the service lets draft", () => {
    let offered = 0;
    let withheld = 0;
    for (const user of DEMO_USERS) {
      const asUser: AiToolContext = {
        queries: createQueryService(ws),
        projections: createProjectionService(ws),
        ctx: { user, correlationId: `T-G-${user.id}`, sourceInterface: "ASK_GAURD" },
      };
      const r = answerQuestion(asUser, "Draft the close memo for me.");
      if (r.answer === undefined) {
        // A role that may not read the memo at all is a restriction, not a
        // silent absence — and never an out-of-scope question.
        expect(r.refusal?.reason, user.id).toBe("NOT_AUTHORIZED");
        continue;
      }
      const memo = createProjectionService(ws).getMemo({
        user,
        correlationId: `T-G-${user.id}`,
        sourceInterface: "ASK_GAURD",
      });
      const prescribes = r.answer.nextAction.includes(AFFORDANCE);
      expect(
        prescribes,
        `${user.id}: canDraft=${memo.canDraft} but the answer ${prescribes ? "does" : "does not"} name the control`,
      ).toBe(memo.canDraft && memo.periodBlocks === null);
      if (prescribes) offered += 1;
      else withheld += 1;
    }
    // Name the set both ways. A run where nobody is offered the control
    // satisfies "never offered to the wrong role" while proving nothing.
    expect(offered, "no demo role was offered drafting").toBeGreaterThan(0);
    expect(withheld, "every demo role was offered drafting").toBeGreaterThan(0);
  });
});

describe("a sentence about a measurement agrees with the measurement", () => {
  /**
   * Each row reads a boolean the SERVICE measured on this run and the answer
   * the engine produced from the same run, and requires them to agree. The
   * direction is not hard-coded: whichever way the data sits, a sentence that
   * stopped tracking it fails.
   */
  it("cost stack: conflicting evidence appears exactly when the decomposition fails", () => {
    const measured = createProjectionService(ws).getCostStandards(ctxFor("CONTROLLER"));
    const answer = answerQuestion(t, "What makes up the standard cost of a unit?").answer;
    expect(answer?.conflictingEvidence.length === 0).toBe(measured.decompositionAgrees);
  });

  it("period costs: conflicting evidence appears exactly when a pool lands in an inventory account", () => {
    const measured = createProjectionService(ws).getCostClassification(ctxFor("CONTROLLER"));
    const answer = answerQuestion(
      t,
      "Which costs did we keep out of inventory this year, and why?",
    ).answer;
    expect(answer?.conflictingEvidence.length === 0).toBe(
      measured.period.keptOutOfInventory,
    );
    expect(answer?.conflictingEvidence.length).toBe(
      measured.period.accountsInGlBalances.length,
    );
  });

  it("disposition: conflicting evidence appears exactly when a disposed serial is still on the book", () => {
    const measured = createProjectionService(ws).getDispositions(ctxFor("CONTROLLER"));
    const answer = answerQuestion(t, "What did we dispose of this year?").answer;
    expect(answer?.conflictingEvidence.length).toBe(measured.disposedSerialsOnBook.length);
    expect(answer?.conflictingEvidence.length === 0).toBe(measured.removedFromBook);
  });

  it("consignment: conflicting evidence appears exactly when a consigned serial is on our book", () => {
    const measured = createProjectionService(ws).getConsignmentHoldings(ctxFor("CONTROLLER"));
    const answer = answerQuestion(t, "Is any stock on our floor owned by somebody else?").answer;
    expect(answer?.conflictingEvidence.length).toBe(measured.consignedSerialsOnBook.length);
  });

  it("custody: missing evidence appears exactly when a unit cannot be placed", () => {
    const measured = createProjectionService(ws).getCustodyBreakdown(ctxFor("CONTROLLER"));
    const answer = answerQuestion(t, "Who is holding our inventory?").answer;
    expect(answer?.missingEvidence.length === 0).toBe(measured.undeterminedUnits === 0);
  });

  it("E&O: an absence is reported exactly when its basis is not on file", () => {
    const measured = createProjectionService(ws).getEoMethodology(ctxFor("CONTROLLER"));
    const answer = answerQuestion(t, "Which stock has not moved in a year?").answer;
    const missing = (answer?.missingEvidence ?? []).join(" ");
    expect(/condition record/i.test(missing)).toBe(!measured.condition.conditionBasisOnFile);
    expect(/recovery price/i.test(missing)).toBe(!measured.recovery.recoveryBasisOnFile);
  });

  it("E&O states no reserve amount, in any figure or any sentence", () => {
    // The one refusal this topic exists to make. No rule, model or assistant
    // proposes a reserve, so nothing here may look like one.
    const answer = answerQuestion(t, "Which stock has not moved in a year?").answer;
    expect(answer?.knownFacts.some((f) => /reserve/i.test(f.label))).toBe(false);
    expect(answer?.exposure).toBeUndefined();
    expect(answer?.managementConclusion).toMatch(/no reserve amount is proposed/i);
  });
});

describe("scope is never rendered as a finding", () => {
  /**
   * The Stage G defect, found while writing these tests and fixed in
   * `procurement.ts`.
   *
   * The document side of goods-in-transit is scope-filtered and the book side
   * is not. For an auditor, one purchase order is withheld — so the two
   * populations differ by that order, `inboundAgrees` came back FALSE, and
   * the Procurement screen printed "The documents and the book do not
   * agree… must be resolved before either figure is relied on." A role-scoped
   * omission was being reported as an unexplained control difference on the
   * one screen whose job is to say the two sides are the same population.
   *
   * `inboundAgrees` is now `null` when the comparison could not be made, the
   * same way `positionMoved` is null before anything is issued.
   */
  const populationsFor = (role: Role): ProcurementPopulationsOut =>
    createProjectionService(ws).getProcurementPopulations(ctxFor(role));

  it("withholds an order from the auditor's document side but not from the book", () => {
    // The premise. Without it the assertions below are about a case that
    // does not occur, and would pass on any implementation.
    const seen = populationsFor("AUDITOR_READ_ONLY");
    expect(seen.withheldOrderCount).toBeGreaterThan(0);
    expect(seen.goodsInTransit.documentUnits).not.toBe(seen.goodsInTransit.inboundUnits);
  });

  it("reports the comparison as impossible, not as a disagreement", () => {
    expect(populationsFor("AUDITOR_READ_ONLY").goodsInTransit.inboundAgrees).toBeNull();
    expect(populationsFor("CONTROLLER").goodsInTransit.inboundAgrees).toBe(true);
  });

  it("never tells a scoped reader the two sides disagree", () => {
    const answer = answerQuestion(
      auditor,
      "Which purchase orders were billed but not received at year-end?",
    ).answer;
    expect(answer, "the auditor's chip refused").toBeDefined();
    expect(answer!.conflictingEvidence).toEqual([]);
    expect(answer!.missingEvidence.join(" ")).toMatch(/access scope/i);
    expect(answer!.managementConclusion).not.toMatch(/do not agree/i);
    // …and the withheld count is a figure, so the shorter population is
    // never silently shorter.
    expect(answer!.knownFacts.some((f) => /withheld/i.test(f.label))).toBe(true);
  });

  it("still states the agreement for a reader who can see every order", () => {
    // The other direction. A fix that simply stopped comparing would satisfy
    // the assertions above and delete the screen's load-bearing sentence.
    const answer = answerQuestion(
      t,
      "Which purchase orders were billed but not received at year-end?",
    ).answer;
    expect(answer!.managementConclusion).toMatch(/same population/i);
    expect(answer!.missingEvidence).toEqual([]);
  });
});

describe("the population an answer describes is the one it read", () => {
  it("resolved exceptions are the whole population less the open ones", () => {
    const all = t.queries.listExceptions(t.ctx);
    const answer = answerQuestion(t, "Which exceptions are resolved?").answer;
    const openCount = all.filter((e) => e.open).length;
    expect(answer?.knownFacts.length).toBe(all.length - openCount);
    // WHICH, not how many: a count is satisfied by the wrong set of the
    // right size.
    const named = new Set(answer?.knownFacts.map((f) => f.label.split(" — ")[0]));
    for (const view of all.filter((e) => !e.open)) {
      expect(named.has(view.exception.id), `${view.exception.id} is missing`).toBe(true);
    }
    for (const view of all.filter((e) => e.open)) {
      expect(named.has(view.exception.id), `${view.exception.id} is open`).toBe(false);
    }
  });

  it("orders the work list by blocker first, then by exposure descending", () => {
    const answer = answerQuestion(t, "What should I work on first?").answer;
    const rows = answer?.knownFacts ?? [];
    expect(rows.length).toBeGreaterThan(1);
    const blocking = rows.map((f) => f.label.includes("(blocks sign-off)"));

    /**
     * At the demo baseline every open exception is also a blocker, so the
     * blocker-then-the-rest ordering has no second group to be wrong about.
     * Asserting it as "the first non-blocker comes after the last blocker"
     * would be an assertion on a branch that does not exist — it passes on
     * any implementation here. What IS load-bearing on this data is which
     * rows are marked and that exposure never rises, so those are what is
     * asserted, plus the tail property for whenever a second group appears.
     */
    const firstUnblocked = blocking.indexOf(false);
    if (firstUnblocked !== -1) {
      expect(blocking.slice(firstUnblocked).some(Boolean)).toBe(false);
    }

    // WHICH rows are marked, against the tool's own blocker list.
    const flagged = new Set(
      rows.filter((f) => f.label.includes("(blocks sign-off)")).map((f) => f.label.split(" ")[1]),
    );
    const actual = new Set(t.queries.getBlockers(t.ctx).map((b) => b.exceptionId));
    expect([...flagged].sort()).toEqual([...actual].sort());

    // Exposure never rises within a group.
    for (let i = 1; i < rows.length; i += 1) {
      if (blocking[i] !== blocking[i - 1]) continue;
      expect(rows[i]!.valueCents!).toBeLessThanOrEqual(rows[i - 1]!.valueCents!);
    }
  });

  it("scopes 'what evidence is missing?' to the exception on screen", () => {
    /**
     * Asked from an exception's own drawer this used to answer with the
     * whole close's gaps — a population the reader did not ask about, with
     * the one they did buried inside it.
     */
    for (const view of t.queries.listExceptions(t.ctx).filter((e) => e.open)) {
      const id = view.exception.id;
      const answer = answerQuestion(t, "What evidence is missing?", { exceptionId: id }).answer;
      expect(answer, id).toBeDefined();
      for (const line of answer!.missingEvidence) {
        expect(line.startsWith(id), `${id} answered about ${line}`).toBe(true);
      }
    }
  });
});

describe("an object the question names is the object answered about", () => {
  it("answers about the exception the question names, with no screen scope", () => {
    const r = answerQuestion(t, "What supports EXC-004?");
    expect(r.route).toBe("evidence-support");
    expect(r.answer?.citations.some((c) => c.label === "EXC-004")).toBe(true);
    expect(r.answer?.citations.some((c) => c.label === "EXC-001")).toBe(false);
  });

  it("refuses an id that names nothing as unknown, not as empty", () => {
    const r = answerQuestion(t, "What supports EXC-993?");
    expect(r.answer).toBeUndefined();
    expect(r.refusal?.reason).toBe("NO_SUCH_OBJECT");
  });

  it("records the route on a refusal as well as on an answer", () => {
    // The route is the interaction record's account of what happened. An
    // answer that refused still went somewhere, or explicitly nowhere.
    expect(answerQuestion(t, "What will Q1 revenue be?").route).toBe("unrouted");
    expect(answerQuestion(t, "What prevents sign-off?").route).toBe("blockers");
  });

  it("answers a unit-scoped screen from the unit when nothing else matches", () => {
    // The Financial Life screen had no fallback: every question that missed
    // the intent table refused, while the object on screen could answer it.
    const r = answerQuestion(t, "Tell me about this one.", { serial: "KE-E2-1048" });
    expect(r.answer, r.refusal?.reason).toBeDefined();
    expect(r.route).toBe("unit-detail");
  });
});

/**
 * Scope, told rather than implied.
 *
 * `tools.ts` computes four flags whose stated purpose (`tools.ts:71`) is to
 * keep "withheld from you" distinguishable from "there is none". Three were
 * declared in `answers.ts` result interfaces and read by nothing, and one was
 * destructured and dropped. A flag that is computed and not read is a
 * disclosure the code looks like it makes.
 */
describe("a restriction reaches the reader, and only a real one", () => {
  const lineageOutOfScope = (c: AiToolContext) =>
    ws.close.exceptions
      .filter((e) => {
        const r = answerQuestion(c, "Why is this still open?", { exceptionId: e.id });
        return r.answer?.knownFacts.some((f) => f.label === "Evidence lineage") === true;
      })
      .map((e) => e.id);

  it("says so when an exception's lineage is outside the reader's scope", () => {
    // Thirteen of fifteen, not one: `traceLineage` returns undefined for an
    // auditor on any exception without provided support, so the citation list
    // silently shortened on almost every exception in the demo.
    const withheld = lineageOutOfScope(auditor);
    expect(withheld.length).toBeGreaterThan(1);
    expect(withheld).toContain("EXC-004");
    // And never claims a restriction for a reader who has none.
    expect(lineageOutOfScope(t)).toEqual([]);
  });

  it("pairs every shortened citation list with the sentence that explains it", () => {
    // The biconditional: fewer citations than the unscoped reader gets IF AND
    // ONLY IF the answer says why. Either half alone is the defect — a silent
    // omission, or a disclosure of something that was not withheld.
    for (const e of ws.close.exceptions) {
      const asked = (c: AiToolContext) =>
        answerQuestion(c, "Why is this still open?", { exceptionId: e.id }).answer;
      const full = asked(t);
      const scoped = asked(auditor);
      const shortened = (scoped?.citations.length ?? 0) < (full?.citations.length ?? 0);
      const explained =
        scoped?.knownFacts.some((f) => f.label === "Evidence lineage") === true;
      expect(explained, `${e.id}: shortened=${shortened} explained=${explained}`).toBe(
        shortened,
      );
    }
  });

  it("counts the withheld components of a scope-reduced timeline", () => {
    const serials = [...new Set(ws.dataset.inventoryUnits.map((u) => u.serial))].filter(
      (s): s is string => s !== undefined,
    );
    let reducedForAuditor = 0;
    for (const serial of serials) {
      for (const [role, c] of [
        ["CONTROLLER", t],
        ["AUDITOR_READ_ONLY", auditor],
      ] as const) {
        const facts =
          answerQuestion(c, "Show me the financial life of this unit", { serial }).answer
            ?.knownFacts ?? [];
        const withheldRows = facts.filter((f) => /withheld by your access scope/.test(String(f.text)));
        const summary = facts.find((f) => f.label === "Components withheld from you");
        // The summary figure and the rows it counts are read on one run.
        expect(summary?.count ?? 0, `${role} ${serial}`).toBe(withheldRows.length);
        if (role === "CONTROLLER") {
          /**
           * A CONTROLLER withholds nothing, so no row may say otherwise — and
           * forty of these fifteen hundred serials said otherwise. An inbound
           * unit with a visible carrier shipment and no delivery yet has a
           * readable reference and no defining fact, and the withheld branch
           * tested only whether the unscoped side named a record. "FP-IN-2288
           * · withheld by your access scope" was printed to every reader about
           * a delivery that had not happened.
           */
          expect(withheldRows, `CONTROLLER ${serial}`).toEqual([]);
        } else if (withheldRows.length > 0) {
          reducedForAuditor += 1;
        }
      }
    }
    // Without a real restriction somewhere, the CONTROLLER assertion above
    // would pass on an implementation that never reports a withholding at all.
    expect(reducedForAuditor).toBeGreaterThan(0);
  });

  it("leaves an event that has not happened off the timeline entirely", () => {
    // The other direction of the same fix: not relabelled, not present. The
    // handler's own rule is that a delivery exists only where a delivery event
    // does, and `life.missing` is where a genuine absence is reported.
    const facts =
      answerQuestion(t, "Show me the financial life of this unit", { serial: "KE-E1-9506" })
        .answer?.knownFacts ?? [];
    const life = t.queries.getFinancialLife(t.ctx, "KE-E1-9506");
    expect(life.records.carrierShipment).toBeDefined();
    expect(life.sellSide.deliveredAt).toBeUndefined();
    expect(facts.some((f) => f.label === "Delivery")).toBe(false);
  });
});

/**
 * The Draft guard, in production rather than in a test.
 *
 * The block above asserts the shipped `MEMO_DRAFT_SECTIONS` constant satisfies
 * the figure and identifier rules — which was ALL that ever enforced them. The
 * stage's own words were that Draft output is "checked by the same quantity and
 * identifier guards that govern provider narration"; `statesQuantity` and
 * `namesRecordIdentifier` were exported for that and then called only from
 * `checkNarration`, and nothing in production called `checkNarration` on a
 * draft. True of the constant, false of the mechanism — and the assertions
 * above would have passed unchanged for a second draft-emitting path that
 * interpolated a live figure.
 *
 * `answerQuestion` now runs `checkDraft` at the one point a draft becomes part
 * of an interaction, so every present and future draft path is covered.
 */
describe("suggested wording is guarded where it is emitted", () => {
  const ALL_SHAPES: readonly { name: string; body: string }[] = [
    { name: "a digit", body: "The difference is 12,450 dollars at the balance-sheet date." },
    { name: "a spelled-out number", body: "There are seven items holding sign-off." },
    { name: "a record identifier", body: "Describe the position, including EXC-001." },
    { name: "a zero-count claim", body: "No exceptions remain open at the date." },
  ];

  it("fires on every shape it claims to catch", () => {
    // A guard that runs and never fires is the same as one that does not run.
    for (const shape of ALL_SHAPES) {
      const verdict = checkDraft([{ heading: "Position", body: shape.body }]);
      expect(verdict.ok, `${shape.name} passed the draft guard`).toBe(false);
      expect(verdict.detail.join(" ")).toMatch(/Draft section "Position"/);
    }
    // And passes prose that keeps its figures out.
    expect(
      checkDraft(
        [{ heading: "Position", body: "Describe the gap in words; the screen supplies the amounts." }],
      ).ok,
    ).toBe(true);
  });

  it("applies the narration rule from the narration definition", () => {
    // Not a second copy of the patterns: the same predicates, so the two
    // cannot answer differently about the same sentence.
    for (const shape of ALL_SHAPES) {
      const byPredicate =
        statesQuantity(shape.body) || namesRecordIdentifier(shape.body);
      expect(byPredicate, shape.name).toBe(true);
    }
  });

  it("does not extend the claim-content denylists to the engine's own prose", () => {
    /**
     * Recorded as a test because the first version of `checkDraft` DID extend
     * them, and the shipped "Reconciling items" section failed instantly on the
     * phrase "has been posted" — inside the sentence "Nothing in this product
     * has been posted, so the memo should not describe the ledger as
     * corrected." Draft prose tells a writer what the product does not do, so
     * it says those verbs deliberately. Telling that apart from a claim that
     * the product acted means deciding whether the claim is negated: the same
     * undecidable comparison as deciding whether a figure is the right figure.
     *
     * So a section may discuss posting, and may not carry a number.
     */
    const denial = [
      {
        heading: "Reconciling items",
        body: "Nothing in this product has been posted, so the memo should not describe the ledger as corrected.",
      },
    ];
    expect(checkDraft(denial).ok).toBe(true);
    expect(statesQuantity(denial[0]!.body)).toBe(false);
    expect(namesRecordIdentifier(denial[0]!.body)).toBe(false);
    // And the shipped constant still contains that exact sentence, so this is
    // a live property of the product's wording rather than a hypothetical.
    const bodies = (answerQuestion(t, "Draft the close memo for me.").answer?.draft ?? [])
      .map((s) => s.body)
      .join(" ");
    expect(bodies).toMatch(/Nothing in this product has been posted/);
  });

  it("emits only sections that survive the guard, and says when one did not", () => {
    /**
     * The wiring, as a biconditional over what production actually returns: a
     * section reaches the reader IF AND ONLY IF it passes, and a dropped
     * section is disclosed. Verified by adding a violating section to
     * `MEMO_DRAFT_SECTIONS` and watching this fail — without the guard wired
     * in, the violating wording rendered and nothing said so.
     */
    const answer = answerQuestion(t, "Draft the close memo for me.").answer;
    const sections = answer?.draft ?? [];
    expect(sections.length).toBeGreaterThan(3);
    for (const section of sections) {
      expect(checkDraft([section]).ok, `"${section.heading}" reached the reader`).toBe(
        true,
      );
    }
    const withheldNote = (answer?.missingEvidence ?? []).filter((m) =>
      /suggested .* withheld/.test(m),
    );
    // Nothing is dropped today, so nothing may claim to have been.
    expect(withheldNote).toEqual([]);
  });
});
