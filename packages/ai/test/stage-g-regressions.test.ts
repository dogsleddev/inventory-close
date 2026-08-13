import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_USERS, userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import {
  createCommandService,
  createProjectionService,
  createQueryService,
  createWorkspace,
  type FinancialLifeView,
  type ProcurementPopulationsOut,
  type ServiceContext,
  type Workspace,
} from "@icg/services";
import {
  answerQuestion,
  checkDraft,
  namesRecordIdentifier,
  runTool,
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
    // In the RESTRICTION channel, not the missing-evidence one. Under MISSING
    // EVIDENCE the drawer renders it in ember, bulleted, suffixed " — missing,
    // required" for a screen reader and counted as a required item reported
    // missing — about a document the close holds and this reader may not read.
    expect(answer!.scopeNotes?.join(" ") ?? "").toMatch(/access scope/i);
    expect(answer!.missingEvidence.join(" ")).not.toMatch(/access scope/i);
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

  /**
   * The same rule, as a category over every role — and the reason the two
   * assertions above were not enough.
   *
   * Both of them test a CONTROLLER, whose scope withholds nothing. The
   * remediation they were written for guarded on whether the reader could
   * read the REFERENCE (`e.ref === undefined`), which is true for a
   * CONTROLLER exactly when the record does not exist, so a controller-only
   * assertion cannot tell that guard apart from a correct one. Every reader
   * whose scope actually filters something kept the defect: an
   * AUDITOR_READ_ONLY read "Delivery · FP-IN-2291 · withheld by your access
   * scope" on KE-X1-9025, KE-X1-9880 and KE-X1-9866, over a delivery that
   * has not happened at any scope.
   *
   * So the property is stated where it is true — for every role, every
   * serial and every state — and the defining fact is read from the SERVICE
   * VIEW rather than from the handler's own line of code.
   *
   * Not an independent derivation, and the comment should not claim one: the
   * service view IS the handler's input, and the map below is a hand-written
   * SECOND STATEMENT of the same rule, duplicated on purpose so that a change
   * to either side is visible. That is a change-detector rather than an
   * oracle, which is what this rule can have — it is a definition, and there
   * is no other source to check it against. What it does buy is real: it fails
   * on the named pre-fix defect, where a WITHHELD row was pushed for a
   * delivery that had not happened.
   */
  it("never puts a row of any state on a timeline for an event the close does not contain", () => {
    const definingFact: Record<string, (life: FinancialLifeView) => boolean> = {
      "Purchase Order": (l) => l.buySide.purchaseOrder !== undefined,
      "Item Receipt": (l) => l.buySide.itemReceipt !== undefined,
      "Vendor Bill": (l) => l.buySide.vendorBill !== undefined,
      "Sales Order": (l) => l.sellSide.salesOrder !== undefined,
      "Item Fulfillment": (l) => l.sellSide.itemFulfillment !== undefined,
      // The delivery DATE, never the carrier shipment that names it.
      Delivery: (l) => l.sellSide.deliveredAt !== undefined,
      Installation: (l) => l.sellSide.installedAt !== undefined,
      "First online": (l) => l.sellSide.firstOnlineAt !== undefined,
      "Customer Invoice": (l) => l.sellSide.customerInvoice !== undefined,
    };
    const serials = ws.dataset.inventoryUnits.map((u) => u.serial);
    let withheldSeen = 0;
    let datedSeen = 0;
    for (const role of DEMO_USERS.flatMap((u) => u.roles)) {
      const c = contextFor(role);
      for (const serial of serials) {
        const payload = runTool(c, "get_evidence_timeline", { serial }).data as
          | { events: readonly { label: string; state: string; ref: string }[] }
          | undefined;
        if (payload === undefined) continue;
        const life = c.queries.getFinancialLife(c.ctx, serial);
        for (const event of payload.events) {
          if (event.state === "WITHHELD") withheldSeen += 1;
          if (event.state === "DATED") datedSeen += 1;
          expect(
            definingFact[event.label]?.(life),
            `${role} ${serial}: ${event.label} ${event.state} (${event.ref}) is on the timeline, but the close holds no such event`,
          ).toBe(true);
        }
      }
    }
    // Both directions, so this cannot pass on a handler that emits nothing:
    // some withholding is real, and the ordinary rows still arrive.
    expect(withheldSeen).toBeGreaterThan(0);
    expect(datedSeen).toBeGreaterThan(0);
  });
});

/**
 * The drawer answers from the close as it stands, not from the frozen
 * baseline.
 *
 * Every tool Ask Gaurd had read `ws.close` — the position the rules derived,
 * before anyone did anything — while every screen beside it read the session.
 * So a Controller who had concluded all seven blockers was told "Sign-off is
 * blocked", "Open blockers = 7", "$198,950" and "81.42%" from a shipped chip
 * on five screens, at the moment the Overview's own gate read "Every blocker
 * has a management conclusion. Signing off locks the period." The drawer
 * published no divergence disclosure of any kind, so the two closes appeared
 * unlabelled one click apart.
 *
 * Asserted as a BICONDITIONAL against `getEffectiveClose` on the same run
 * rather than against the figures above. Pinning "0 blockers" would pass
 * forever once the data moved underneath it, which is exactly how the Stage F
 * review found authored prose describing a population of zero — and pinning
 * "7" is what shipped this defect.
 */
describe("the live close, not the baseline", () => {
  /** A workspace of its own: these tests record conclusions. */
  const workedClose = () => {
    const fresh = createWorkspace();
    const queries = createQueryService(fresh);
    const commands = createCommandService(fresh);
    const asController = ctxFor("CONTROLLER");
    // A second person reviews: submitting and accepting your own evidence is
    // self-approval, which the service refuses.
    const asManager = ctxFor("ACCOUNTING_MANAGER");
    const t2: AiToolContext = {
      queries,
      projections: createProjectionService(fresh),
      ctx: asController,
    };
    return { fresh, queries, commands, asController, asManager, t2 };
  };

  const resolveEveryBlocker = (w: ReturnType<typeof workedClose>) => {
    for (const blocker of [...w.fresh.close.blockers]) {
      const id = blocker.exceptionId;
      for (const requirement of w.queries.getExceptionWorkflow(w.asController, id)
        .unmetRequirements) {
        const submitted = w.commands.submitEvidence(w.asController, {
          title: `Support for ${requirement}`,
          kind: "DOCUMENT",
          content: { note: "Obtained." },
          relatedObjectRef: id,
          satisfiesRequirement: { exceptionId: id, requirement },
        });
        w.commands.reviewEvidence(w.asManager, submitted.id, "ACCEPTED", "Reviewed.");
      }
      w.commands.concludeException(w.asController, {
        exceptionId: id,
        conclusion: "RESOLVED_NO_ADJUSTMENT",
        rationale: "Support obtained and reviewed; no adjustment required.",
      });
    }
  };

  it("reports the blocker position the close actually holds", () => {
    const w = workedClose();
    const ask = () => answerQuestion(w.t2, "What prevents sign-off?", {}).answer;
    const figure = (label: string) =>
      ask()?.knownFacts.find((f) => f.label === label);

    // Before: the baseline and the live position agree, so nothing can be
    // proved yet — this is the premise, not the assertion.
    const before = w.queries.getEffectiveClose(w.asController);
    expect(before.diverged).toBe(false);
    expect(figure("Open blockers")?.count).toBe(before.blockerCount);

    resolveEveryBlocker(w);

    const live = w.queries.getEffectiveClose(w.asController);
    // The premise of everything below: the two positions now differ.
    expect(live.diverged).toBe(true);
    expect(live.blockerCount).not.toBe(live.baselineBlockerCount);
    expect(live.readinessBps).not.toBe(live.baselineReadinessBps);

    const answer = ask();
    expect(figure("Open blockers")?.count).toBe(live.blockerCount);
    expect(figure("Close readiness")?.valueBps).toBe(live.readinessBps);
    expect(answer?.exposure?.valueCents).toBe(live.blockerExposureCents);
    // And the prohibition itself, which is the half that made this a P0: it
    // was a constant, so it was "true today" rather than measured.
    expect(answer?.status).not.toMatch(/^Sign-off is blocked/);
  });

  it("names the baseline as the baseline rather than dropping it", () => {
    // The other direction. An answer that simply switched to live figures
    // would satisfy the test above and lose the reproducible position, which
    // is the artifact the whole product is built to defend.
    const w = workedClose();
    resolveEveryBlocker(w);
    const live = w.queries.getEffectiveClose(w.asController);
    const answer = answerQuestion(w.t2, "What prevents sign-off?", {}).answer;
    const baseline = answer?.knownFacts.find((f) =>
      /rules derived/.test(f.label) && f.count !== undefined,
    );
    expect(baseline?.count).toBe(live.baselineBlockerCount);
    expect(answer?.managementConclusion).toMatch(/Reset Demo/);
  });

  it("reports a recorded conclusion instead of denying one", () => {
    const w = workedClose();
    const id = w.fresh.close.blockers[0]!.exceptionId;
    const ask = () =>
      answerQuestion(w.t2, `Why is ${id} still open?`, { exceptionId: id }).answer;

    // The premise: the shipped seed records no conclusion, so on first load
    // the sentence the fix removes is TRUE. Without this the assertion below
    // would pass on an engine that never says it.
    expect(ask()?.managementConclusion).toMatch(/No conclusion has been recorded/);

    w.commands.concludeException(w.asController, {
      exceptionId: id,
      conclusion: "REMAINS_OPEN",
      rationale: "Reviewed; stays open pending the contract.",
    });

    const workflow = w.queries.getExceptionWorkflow(w.asController, id);
    expect(workflow.conclusion).not.toBeNull();
    const answer = ask();
    // `get_exception` carries no conclusion field, so the old sentence was not
    // a wrong lookup — it was a comparison that never happened, reported as a
    // negative result, on the product's trust screen.
    expect(answer?.managementConclusion).not.toMatch(/No conclusion has been recorded/);
    expect(answer?.knownFacts.some((f) => f.label === "Management conclusion")).toBe(true);
    // REMAINS_OPEN records that a person looked and decided it stays open, so
    // the item is still open and the answer must not read as resolved.
    expect(workflow.open).toBe(true);
    /**
     * And the outstanding record is STILL reported. This assertion originally
     * required the opposite — that recording a conclusion suppressed the
     * obtain-instruction — which encoded the defect a later pass found: the
     * answer said "None outstanding on this item" while its own MISSING
     * EVIDENCE block named the record and the service reported it unmet.
     *
     * Asserted as the biconditional so it cannot encode a preference again:
     * the instruction stands exactly when the workspace still wants something.
     */
    expect(/^Obtain:/.test(answer?.nextAction ?? "")).toBe(
      workflow.unmetRequirements.length > 0,
    );
    expect(answer?.nextAction).not.toMatch(/None outstanding/);
  });

  it("counts resolutions the close actually holds, not the ones the rules made", () => {
    const w = workedClose();
    const resolvedNow = () =>
      w.queries.getEffectiveExceptions(w.asController).filter((e) => !e.open).length;
    const stated = () => {
      const status = answerQuestion(w.t2, "Which exceptions are resolved?", {}).answer?.status;
      return Number(/^(\d+) of/.exec(status ?? "")?.[1]);
    };
    // Premise: baseline agreement, so the assertion below has something to prove.
    expect(stated()).toBe(resolvedNow());
    const before = resolvedNow();

    resolveEveryBlocker(w);

    // `concludeException` writes to ws.conclusions and never to
    // exception.status, so a count off the frozen status provably cannot move.
    expect(resolvedNow()).toBeGreaterThan(before);
    expect(stated()).toBe(resolvedNow());
  });

  it("reports outstanding evidence against what the workspace still wants", () => {
    const w = workedClose();
    const outstanding = () =>
      w.queries
        .getEffectiveExceptions(w.asController)
        .filter((e) => e.open)
        .reduce((n, e) => n + e.unmetRequirements.length, 0);
    const stated = () => {
      const status = answerQuestion(w.t2, "Which evidence is still missing?", {}).answer?.status;
      // "No exception is open" and "No required record is outstanding on the
      // open items" are both the zero case; only the counted form carries a
      // number. Bounded to the OPEN population, which is what `gaps` measures.
      const counted = /^(\d+) required/.exec(status ?? "");
      return counted === null ? 0 : Number(counted[1]);
    };
    expect(outstanding()).toBeGreaterThan(0);
    expect(stated()).toBe(outstanding());

    resolveEveryBlocker(w);

    expect(outstanding()).toBe(0);
    expect(stated()).toBe(0);
  });

  it("answers the evidence chip when nothing is outstanding, rather than refusing", () => {
    /**
     * The branch this covers was unreachable while the count came off the
     * frozen finding, so returning undefined cost nothing. Sourcing it live
     * makes it reachable — and an intent returning undefined falls through to
     * OUT_OF_SCOPE, which is a chip the product ships refusing a question the
     * product suggested, at the moment the answer is best.
     */
    const w = workedClose();
    resolveEveryBlocker(w);
    const r = answerQuestion(w.t2, "Which evidence is still missing?", {});
    expect(r.refusal).toBeUndefined();
    // Bounded to the population it measured: `gaps` only ever sees the open
    // set, so the sentence may not claim the whole close.
    expect(r.answer?.status).toMatch(/^No (exception is open|required record is outstanding on the open items)/);
    expect(r.answer?.status).not.toMatch(/^No required record is outstanding$/);
    expect(r.answer?.missingEvidence).toEqual([]);

    /**
     * And the CONCLUSION is anchored to the whole close, not to the population
     * the answer happens to have measured.
     *
     * The oracle is the workspace's own count across all fifteen exceptions,
     * deliberately not the `.filter(e => e.open)` the handler uses — a test
     * that restates the implementation's filter agrees with a scoping error by
     * construction, and this branch's first version put "Every required record
     * the rules asked for is on file" on top of an open-only measurement while
     * nine records on the resolved items were never filed.
     */
    const everywhere = w.queries
      .getEffectiveExceptions(w.asController)
      .reduce((n, e) => n + e.unmetRequirements.length, 0);
    const claimsTheWholeFile = /Every required record the rules asked for is on file/.test(
      r.answer?.managementConclusion ?? "",
    );
    expect(everywhere).toBeGreaterThan(0);
    expect(claimsTheWholeFile).toBe(everywhere === 0);
    expect(r.answer?.managementConclusion).toMatch(/never filed/);
  });

  it("stops telling a reader to conclude what has been concluded", () => {
    const w = workedClose();
    const waiting = () =>
      w.queries
        .getPbcPackage(w.asController)
        .reduce((n, i) => n + i.blockedBy.length, 0);
    const prescribes = () =>
      /Conclude the close items/.test(
        answerQuestion(w.t2, "How ready is the audit package?", {}).answer?.nextAction ?? "",
      );
    // The biconditional: the instruction stands exactly while something is
    // waiting on a close conclusion.
    expect(waiting()).toBeGreaterThan(0);
    expect(prescribes()).toBe(true);

    resolveEveryBlocker(w);

    expect(waiting()).toBe(0);
    expect(prescribes()).toBe(false);
  });

  it("still says nothing has been concluded when nothing has", () => {
    // The false-negative direction: an answer that always claimed a conclusion
    // would satisfy the test above.
    const w = workedClose();
    const id = w.fresh.close.blockers[0]!.exceptionId;
    const answer = answerQuestion(w.t2, `Why is ${id} still open?`, { exceptionId: id }).answer;
    expect(answer?.managementConclusion).toMatch(/No conclusion has been recorded/);
    expect(answer?.knownFacts.some((f) => f.label === "Management conclusion")).toBe(false);
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

/**
 * A figure's label names what was summed, and a prescription branches on the
 * set it prescribes work over.
 */
describe("labels and imperatives track their own populations", () => {
  it("does not call the whole GL difference 'unreconciled' while nothing is unexplained", () => {
    const recon = createQueryService(ws).getReconciliation(ctxFor("CONTROLLER"));
    const answer = answerQuestion(t, "Why doesn't inventory tie?", {}).answer;
    // The premise: the two figures genuinely differ on this dataset, so the
    // label is doing work rather than naming the same number twice.
    expect(recon.differenceCents).not.toBe(recon.unexplainedCents);
    expect(recon.unexplainedCents).toBe(0);

    // The biconditional: "unreconciled" is used exactly when there is some.
    const usesUnreconciled = /Unreconciled/.test(answer?.exposure?.label ?? "");
    expect(usesUnreconciled).toBe(recon.unexplainedCents > 0);
    expect(answer?.exposure?.valueCents).toBe(
      recon.unexplainedCents > 0 ? recon.unexplainedCents : recon.differenceCents,
    );
    // And the answer's own sentence, three rows up, must not contradict it.
    expect(answer?.managementConclusion).toMatch(/identified and attributed/);
  });

  /**
   * The other arm, which the dataset cannot produce.
   *
   * `ws.close.reconciliation` is baseline-derived and `unexplainedCents` is
   * structurally zero, so the test above only ever exercises the zero side —
   * a build that deleted the `unexplainedCents > 0` arm outright would pass
   * it. Named a biconditional, exercised as a one-sided implication. Driven
   * here through a mutated workspace, because the arm that is unreachable
   * today is the one a future change makes live, and it was carrying the same
   * label/sentence contradiction the reachable arm was fixed to remove.
   */
  it("says 'unreconciled' and drops the attributed-in-full sentence together", () => {
    const local = createWorkspace();
    const recon = local.close.reconciliation as { unexplainedCents: number };
    // The premise, watched failing first: zero on the untouched close.
    expect(recon.unexplainedCents).toBe(0);
    recon.unexplainedCents = 250_00;

    const localT: AiToolContext = {
      queries: createQueryService(local),
      projections: createProjectionService(local),
      ctx: ctxFor("CONTROLLER"),
    };
    const answer = answerQuestion(localT, "Why doesn't inventory tie?", {}).answer;
    expect(answer?.exposure?.label).toMatch(/Unreconciled/);
    expect(answer?.exposure?.valueCents).toBe(250_00);
    // The label and the sentence are one claim. This is what the arm got wrong.
    expect(answer?.managementConclusion).not.toMatch(/identified and attributed/);
    expect(answer?.managementConclusion).toMatch(/attributed to no reconciling item/);
  });

  /**
   * The expected figure is a LITERAL derived from the fixture by hand, and the
   * rows are named.
   *
   * The first version of this test recomputed the implementation's own
   * expression — `r.serial !== undefined && openSerials.has(r.serial)` over
   * every plan — so it agreed with both of that expression's errors by
   * construction, and asserted 1 === 1 while the derivation underneath was
   * wrong in two ways. A test built from the code under test cannot see the
   * code under test.
   *
   * The year-end plan has four variance rows (`countSummary.varianceRows`, and
   * eight across all plans — the figure the answer used to count over):
   *
   *   KE-E2-8904 · PRIMARY_WAREHOUSE · −1  → EXC-006, resolved
   *   KE-X1-3498 · PRIMARY_WAREHOUSE · −1  → EXC-003, OPEN
   *   KV-Z1      · PRIMARY_WAREHOUSE · −2  → EXC-005, resolved (no serial)
   *   KE-E2-1986 · STAGING          · +1  → EXC-013, resolved
   */
  it("counts the count variances that are still open, and branches on that", () => {
    const queries = createQueryService(ws);
    const summary = queries.getCountSummary(ctxFor("CONTROLLER"));
    const detail = queries.getCountDetail(ctxFor("CONTROLLER"));

    // The premise, asserted rather than assumed: the two populations really do
    // differ, so counting over the wrong one is a live error and not a
    // distinction without a difference.
    expect(summary.varianceRows).toBe(4);
    expect(detail.results.filter((r) => r.variance !== 0).length).toBe(8);

    const answer = answerQuestion(t, "Which count issues are still open?", {}).answer;
    const stated = answer?.knownFacts.find((f) => f.label === "Variance rows still open");
    expect(stated?.source).toBe("get_cycle_count_history");
    // One: KE-X1-3498, whose EXC-003 is the only open exception naming a
    // year-end variance row.
    expect(stated?.count).toBe(1);
    expect(answer?.knownFacts.find((f) => f.label === "Variance rows")?.count).toBe(4);
    // The imperative is the same claim as the figure, so it branches with it.
    expect(answer?.nextAction).toMatch(/Resolve the open count variances/);
  });

  /**
   * The join must reach a variance row that no serial names.
   *
   * CNT-VAR-001 is the one rule whose entire subject is count variances, and
   * it fires on non-serialized stock: `serial === undefined`, subjects
   * `{skus, locations}`. A join written only on `subjects.serials` cannot see
   * it, so with EXC-005 open the answer asserted "No count variance is still
   * open" — a silent omission rendering as a zero, in the slot that then
   * prescribes no work.
   *
   * Constructed in-test because the baseline cannot produce it: the scenario
   * resolves EXC-005 by recount. `createWorkspace()` builds a fresh close per
   * call, so mutating this one is isolated to this test.
   */
  it("sees an open variance whose exception names a sku and a location, not a serial", () => {
    const local = createWorkspace();
    const exc005 = local.close.exceptions.find((e) => e.id === "EXC-005")!;
    const exc003 = local.close.exceptions.find((e) => e.id === "EXC-003")!;
    // The premise this test turns on: EXC-005 names no serial at all.
    expect(exc005.finding.subjects.serials ?? []).toEqual([]);
    expect(exc005.finding.subjects.skus).toEqual(["KV-Z1"]);
    expect(exc005.finding.subjects.locations).toEqual(["PRIMARY_WAREHOUSE"]);

    // Reopen the sku/location one, close the serial one. Now the ONLY open
    // variance is the one a serial join cannot reach.
    (exc005 as { status: string }).status = "RECOUNT_REQUIRED";
    (exc003 as { status: string }).status = "RESOLVED_NO_ADJUSTMENT";

    const localT: AiToolContext = {
      queries: createQueryService(local),
      projections: createProjectionService(local),
      ctx: ctxFor("CONTROLLER"),
    };
    const answer = answerQuestion(localT, "Which count issues are still open?", {}).answer;
    expect(answer?.knownFacts.find((f) => f.label === "Variance rows still open")?.count).toBe(1);
    expect(answer?.nextAction).toMatch(/Resolve the open count variances/);
  });
});

/**
 * A reader who names a record is asking about that record.
 *
 * `context.serial ?? extractSerial(question)` preferred the screen and
 * short-circuits, so the id the reader typed was never evaluated. Asking about
 * KE-X1-9025 from KE-E2-1048's page returned KE-E2-1048's carrying value,
 * location and document chain, under a header naming KE-E2-1048, with the
 * question the reader typed rendered directly above it — and nothing anywhere
 * saying a different unit had been answered.
 */
describe("the record a question names outranks the screen it was asked from", () => {
  const EN_DASH = String.fromCharCode(0x2013);

  it("answers the named unit, not the screen's", () => {
    const answer = answerQuestion(t, "Walk me through KE-X1-9025's financial life.", {
      serial: "KE-E2-1048",
    }).answer;
    expect(answer?.status).toMatch(/KE-X1-9025/);
    expect(answer?.status).not.toMatch(/KE-E2-1048/);
    // And says so, because the drawer prints no subject label of its own.
    //
    // In the restriction channel, and asserted as NOT in the conclusion one:
    // MANAGEMENT CONCLUSION carries the human judgement, and a routing fact
    // the engine authored does not belong under that heading. Both halves are
    // asserted, because only the negative catches the sentence drifting back.
    expect(answer?.scopeNotes?.some((n) => /not KE-E2-1048/.test(n))).toBe(true);
    expect(answer?.managementConclusion).not.toMatch(/KE-E2-1048/);
  });

  it("answers the named exception, not the screen's", () => {
    const answer = answerQuestion(t, "Why is EXC-007 still open?", {
      exceptionId: "EXC-001",
    }).answer;
    expect(answer?.knownFacts.some((f) => /EXC-007/.test(f.text ?? ""))).toBe(true);
    expect(answer?.scopeNotes?.some((n) => /not EXC-001/.test(n))).toBe(true);
    expect(answer?.managementConclusion).not.toMatch(/EXC-001/);
  });

  it("says nothing about a swap when there was none", () => {
    // The false-positive direction: a note on every scoped answer would satisfy
    // the two above and add a sentence to every drawer on every unit screen.
    for (const [q, scope] of [
      ["Walk me through KE-E2-1048's financial life.", { serial: "KE-E2-1048" }],
      ["Walk me through this unit's financial life.", { serial: "KE-E2-1048" }],
    ] as const) {
      const answer = answerQuestion(t, q, scope).answer;
      expect(answer?.managementConclusion, q).not.toMatch(/which is what this screen is scoped to/);
    }
  });

  it("reads an identifier the matcher would fold", () => {
    // Extraction ran on the RAW question while matching ran on the normalized
    // one, so a serial pasted from a memo — or produced by Word autocorrect —
    // refused about a unit the product renders its own screen for.
    const q = `Walk me through KE${EN_DASH}E2${EN_DASH}1048's financial life.`;
    const r = answerQuestion(t, q, {});
    expect(r.refusal).toBeUndefined();
    expect(r.answer?.status).toMatch(/KE-E2-1048/);
  });
});

/**
 * A restriction is reported, never absorbed.
 *
 * `session.run` returns undefined for NOT_FOUND and NOT_AUTHORIZED alike, and
 * three handlers read that as permission to skip an existence check. So a
 * reader denied `get_exception` was handed a confident answer with no mention
 * that part of it had been refused — the tool layer's own "restricted, never a
 * silent absence" rule, lost one layer up.
 */
describe("a denied lookup is disclosed in the answer that used it", () => {
  /** A tool context whose named tools throw the service's own denial. */
  const denying = (deny: ReadonlySet<string>): AiToolContext => {
    const queries = createQueryService(ws);
    const proxied = new Proxy(queries, {
      get(target, prop: string) {
        const value = (target as unknown as Record<string, unknown>)[prop];
        if (typeof value !== "function" || !deny.has(prop)) return value;
        return () => {
          const error = new Error(`denied ${prop}`);
          error.name = "AuthorizationError";
          throw error;
        };
      },
    });
    return {
      queries: proxied as typeof queries,
      projections: createProjectionService(ws),
      ctx: ctxFor("CONTROLLER"),
    };
  };

  it("says so when a lookup behind the answer was refused", () => {
    // `searchSerial` establishes that the unit EXISTS before anything is said
    // about it. Denied, `run` returns undefined — the same value NOT_FOUND
    // returns — and `if (hits !== undefined && !hits.some(...))` reads that as
    // permission to skip the check and answer anyway.
    const t2 = denying(new Set(["searchSerial"]));
    const r = answerQuestion(t2, "Financial life of KE-E2-1048", {});
    // The premise: an answer really was produced, and a call really was denied.
    expect(r.answer).toBeDefined();
    expect(r.toolCalls.some((c) => c.outcome === "NOT_AUTHORIZED")).toBe(true);
    // A refusal is a restriction, so it lands in the restriction channel.
    expect(r.answer?.scopeNotes?.join(" ") ?? "").toMatch(/refused at your access scope/);
    expect(r.answer?.scopeNotes?.join(" ") ?? "").toMatch(/restriction on what you may read/);
    expect(r.answer?.missingEvidence.join(" ")).not.toMatch(/refused at your access scope/);
  });

  it("says nothing about a refusal when none happened", () => {
    // The false-positive direction: a line on every answer would satisfy the
    // assertion above and put a restriction notice on every clean drawer.
    const r = answerQuestion(t, "Financial life of KE-E2-1048", {});
    // Asserted first, because `?? ""` turns "the answer vanished" into "the
    // answer said nothing about a refusal" — the guard would go on passing if
    // the financial-life handler stopped answering at all.
    expect(r.answer).toBeDefined();
    expect(r.toolCalls.some((c) => c.outcome === "NOT_AUTHORIZED")).toBe(false);
    expect(r.answer!.scopeNotes?.join(" ") ?? "").not.toMatch(/refused at your access scope/);
  });

  /**
   * The denial the shipped role matrix can actually produce, with no proxy.
   *
   * Every assertion above runs against a fabricated denial, where the denied
   * call and the answering route are the same route — which is precisely the
   * case that cannot see the defect. `session.anyDenied` was session-wide, so
   * a WAREHOUSE reader on a unit screen got "1 of the lookups behind this
   * answer was refused (get_pbc_status). It is not a complete answer." over a
   * complete financial-life answer that never called it. WAREHOUSE,
   * SUPPLY_CHAIN and LEGAL are the three roles without `pbc.read`.
   *
   * It takes ONE `answerQuestion` call, because that is what a session is: the
   * pbc intent matches, `get_pbc_status` is denied, the intent returns
   * undefined, and the serial-scoped fallback answers from tools that were all
   * permitted. A test that made two calls would prove nothing — each call
   * builds its own session, so the denial could never reach the second answer.
   */
  it("attributes a denial to the answering route, not to the session", () => {
    for (const role of ["WAREHOUSE", "SUPPLY_CHAIN", "LEGAL"] as const) {
      const asRole: AiToolContext = {
        queries: createQueryService(ws),
        projections: createProjectionService(ws),
        ctx: ctxFor(role),
      };
      const r = answerQuestion(asRole, "How ready is the PBC package?", {
        serial: "KE-E2-1048",
      });
      // The premise, both halves: a denial really happened, and the fallback
      // really produced an answer over it.
      expect(
        r.toolCalls.some((c) => c.tool === "get_pbc_status" && c.outcome === "NOT_AUTHORIZED"),
        `${role} was not denied get_pbc_status`,
      ).toBe(true);
      expect(r.answer, `${role} got no fallback answer`).toBeDefined();
      expect(r.route).toBe("unit-detail");

      // The answering route called nothing that was refused, so nothing about
      // a refusal may be attached to it.
      const notes = r.answer!.scopeNotes?.join(" ") ?? "";
      expect(notes, `${role} was told a complete answer was incomplete`).not.toMatch(
        /refused at your access scope/,
      );
      expect(notes).not.toMatch(/get_pbc_status/);
    }
  });
});

describe("a withheld timeline component is marked, never dropped", () => {
  it("keeps every event the close holds, in some state, for every reader", () => {
    /**
     * Installation and First online were the only two rows with no unscoped
     * identifier, so a reader whose scope hid the record lost the row entirely
     * — while `withheldCount` and `scopeReduced` positively reported that
     * nothing had been withheld, which suppressed the disclosure the answer
     * engine is already built to print.
     */
    const serials = createQueryService(ws)
      .listInventoryUnits(ctxFor("CONTROLLER"))
      .map((u) => u.serial);
    let sawWithheld = 0;
    // The two labels the fix is ABOUT. A bare `sawWithheld > 0` floor is
    // satisfied by any withheld row anywhere — it guards the shape of this
    // test, not its subject, and one fixture edit away it would pass
    // vacuously while reporting that it had verified the fix.
    const withheldLabels = new Set<string>();
    for (const serial of serials) {
      const asController = runTool(t, "get_evidence_timeline", { serial }).data as {
        events: { label: string }[];
      };
      const asAuditor = runTool(auditor, "get_evidence_timeline", { serial }).data as {
        events: { label: string; state: string }[];
        withheldCount: number;
        scopeReduced: boolean;
      };
      // The label SET is scope-independent: what a reader may see changes,
      // what the close contains does not.
      expect(
        [...asAuditor.events.map((e) => e.label)].sort(),
        `${serial}: the auditor's timeline lost an event the close holds`,
      ).toEqual([...asController.events.map((e) => e.label)].sort());
      // And the flag agrees with the rows.
      const withheld = asAuditor.events.filter((e) => e.state === "WITHHELD").length;
      expect(asAuditor.withheldCount, serial).toBe(withheld);
      expect(asAuditor.scopeReduced, serial).toBe(withheld > 0);
      sawWithheld += withheld;
      for (const e of asAuditor.events) if (e.state === "WITHHELD") withheldLabels.add(e.label);
    }
    // Without this the equality above passes on a dataset that withholds
    // nothing, proving only that two identical lists are identical.
    expect(sawWithheld).toBeGreaterThan(0);
    // And named, so the floor is about the rows the fix restored.
    expect(withheldLabels).toContain("Installation");
    expect(withheldLabels).toContain("First online");
  });
});

/**
 * The memo answer's two world-claims, each read from the field that decides it.
 *
 * "the close position is the one below" never consulted `positionMoved`, which
 * sits on the same `MemoOut` the handler already holds — so it was
 * byte-identical whether the close had moved since issue or not, printing the
 * live figures under a sentence calling them the issued ones.
 *
 * "Nothing drafted and nothing issued" was a claim about the world made from a
 * field the reader's own scope had nulled. An auditor read it three blocks
 * above the same answer's note that a draft was withheld from them.
 */
describe("the memo answer reads the fields its sentences depend on", () => {
  const memoWorld = () => {
    const fresh = createWorkspace();
    const commands = createCommandService(fresh);
    const ctl: ServiceContext = {
      user: userByRole("CONTROLLER"),
      correlationId: "T-MEMO-W",
      sourceInterface: "ASK_GAURD",
    };
    const asRole = (role: Role): AiToolContext => ({
      queries: createQueryService(fresh),
      projections: createProjectionService(fresh),
      ctx: { user: userByRole(role), correlationId: "T-MEMO-W", sourceInterface: "ASK_GAURD" },
    });
    const status = (role: Role) =>
      answerQuestion(asRole(role), "Draft the close memo for me.", {}).answer?.status ?? "";
    return { fresh, commands, ctl, asRole, status };
  };

  it("does not tell a reader nothing is drafted when a draft is merely withheld", () => {
    const w = memoWorld();
    // Premise: at baseline the sentence is TRUE, for everyone.
    expect(w.status("CONTROLLER")).toMatch(/Nothing drafted and nothing issued/);
    expect(w.status("AUDITOR_READ_ONLY")).toMatch(/Nothing drafted and nothing issued/);

    w.commands.saveMemoDraft(w.ctl, { title: "Working draft", body: "INTERNAL — do not circulate" });

    const memo = createProjectionService(w.fresh).getMemo({
      user: userByRole("AUDITOR_READ_ONLY"),
      correlationId: "T-MEMO-W",
      sourceInterface: "ASK_GAURD",
    });
    // The premise of the fix: the draft IS withheld from this reader.
    expect(memo.workingDraft).toBeNull();
    expect(memo.withheldDraftCount).toBeGreaterThan(0);

    expect(w.status("AUDITOR_READ_ONLY")).not.toMatch(/Nothing drafted/);
    expect(w.status("AUDITOR_READ_ONLY")).toMatch(/withheld from your role/);
    // And the other direction: a reader who may see it is told it exists, not
    // that something is being kept from them.
    expect(w.status("CONTROLLER")).toMatch(/A working draft exists/);
    expect(w.status("CONTROLLER")).not.toMatch(/withheld/);
  });

  it("says the close has moved exactly when the memo says it has", () => {
    const w = memoWorld();
    w.commands.saveMemoDraft(w.ctl, { title: "Working draft", body: "Draft." });
    w.commands.issueMemoVersion(w.ctl, { note: "Issued." });

    const memoOf = () =>
      createProjectionService(w.fresh).getMemo({
        user: userByRole("CONTROLLER"),
        correlationId: "T-MEMO-W",
        sourceInterface: "ASK_GAURD",
      });
    const moved = () => /the close has moved since it was sealed/.test(w.status("CONTROLLER"));

    // Premise: issued and unmoved, so the original sentence is correct here.
    expect(memoOf().positionMoved).toBe(false);
    expect(moved()).toBe(false);

    // Move the close through the product's own verbs.
    const queries = createQueryService(w.fresh);
    const id = w.fresh.close.blockers[0]!.exceptionId;
    for (const requirement of queries.getExceptionWorkflow(w.ctl, id).unmetRequirements) {
      const submitted = w.commands.submitEvidence(w.ctl, {
        title: `Support for ${requirement}`,
        kind: "DOCUMENT",
        content: { note: "Obtained." },
        relatedObjectRef: id,
        satisfiesRequirement: { exceptionId: id, requirement },
      });
      w.commands.reviewEvidence(
        {
          user: userByRole("ACCOUNTING_MANAGER"),
          correlationId: "T-MEMO-W",
          sourceInterface: "ASK_GAURD",
        },
        submitted.id,
        "ACCEPTED",
        "Reviewed.",
      );
    }
    w.commands.concludeException(w.ctl, {
      exceptionId: id,
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "Support obtained.",
    });

    // The biconditional, both ends of it.
    expect(memoOf().positionMoved).toBe(true);
    expect(moved()).toBe(true);
  });

  /**
   * The property where it can actually fail: "moved" implies the field says so.
   *
   * The first version asserted that a status printed before anything is issued
   * says nothing about movement — but the `positionMoved` branch is nested
   * inside `memo.issued !== null`, so with nothing sealed the branch is
   * unreachable and NO implementation of it could have put "moved" in that
   * string. It held for every possible implementation and constrained nothing;
   * the null/false distinction is enforced by the nesting, not by the guard.
   *
   * Stated as the implication over all four states instead, so the mutation it
   * names — treating `null` as `false`, or as `true` — is one it can see.
   */
  it("says 'moved' only where the field says the position moved", () => {
    const w = memoWorld();
    const memoFor = () =>
      createProjectionService(w.fresh).getMemo({
        user: userByRole("CONTROLLER"),
        correlationId: "T-MEMO-W",
        sourceInterface: "ASK_GAURD",
      });
    const check = (label: string) => {
      const saysMoved = /moved/.test(w.status("CONTROLLER"));
      expect(saysMoved, `${label}: positionMoved=${String(memoFor().positionMoved)}`).toBe(
        memoFor().positionMoved === true,
      );
    };

    // 1. Untouched: nothing drafted, nothing issued.
    expect(memoFor().positionMoved).toBeNull();
    check("untouched");

    // 2. A draft exists, nothing issued. `null` is not `false`: with nothing
    //    sealed there is nothing to compare.
    w.commands.saveMemoDraft(w.ctl, { title: "Working draft", body: "Draft." });
    expect(memoFor().positionMoved).toBeNull();
    check("drafted, unissued");

    // 3. Issued, and the close has not moved since.
    w.commands.issueMemoVersion(w.ctl, { note: "First issue." });
    expect(memoFor().positionMoved).toBe(false);
    check("issued, unmoved");

    // 4. Issued, then the close moves under it. Through the product's own
    //    verbs: `concludeException` will not resolve an item whose required
    //    records are outstanding, so the records are obtained first.
    const queries = createQueryService(w.fresh);
    const id = w.fresh.close.blockers[0]!.exceptionId;
    for (const requirement of queries.getExceptionWorkflow(w.ctl, id).unmetRequirements) {
      const submitted = w.commands.submitEvidence(w.ctl, {
        title: `Support for ${requirement}`,
        kind: "DOCUMENT",
        content: { note: "Obtained." },
        relatedObjectRef: id,
        satisfiesRequirement: { exceptionId: id, requirement },
      });
      w.commands.reviewEvidence(
        {
          user: userByRole("ACCOUNTING_MANAGER"),
          correlationId: "T-MEMO-W",
          sourceInterface: "ASK_GAURD",
        },
        submitted.id,
        "ACCEPTED",
        "Reviewed.",
      );
    }
    w.commands.concludeException(w.ctl, {
      exceptionId: id,
      conclusion: "RESOLVED_NO_ADJUSTMENT",
      rationale: "Support obtained.",
    });
    expect(memoFor().positionMoved).toBe(true);
    check("issued, moved");
  });
});
