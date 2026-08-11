import type { DemoUser } from "@icg/data";
import type { TransactionChain } from "@icg/domain";
import { getGlAccountReconciliation } from "@icg/services";
import type {
  AdjustmentRegisterOut,
  ExceptionView,
  GlAccountReconciliationOut,
  ReconciliationOut,
} from "@icg/services";
import { formatCents, formatDate, formatDateShort } from "../format";
import type {
  BridgeRow,
  ChainNodeView,
  EvidenceRecordView,
  ExceptionDrawerData,
  FinancialBridgeData,
  ReconciliationData,
  TabDef,
} from "../view-model";
import { conclusionLabel, statusView } from "../workflow-view";
import { attempt } from "./data";
import {
  assembleChainNodes,
  assembleDrawer,
  assembleEvidenceRecord,
  gatherExceptionContext,
} from "./exception-view";
import { countOutcome, countOutcomeDetail } from "./financial-life-view";
import { classificationLabel, locationLabel, titleCase } from "./humanize";
import { getQueries, getWorkspace, makeContext, roleLabel } from "./workspace";

/**
 * Reconciliation — the Financial bridge (stage 07) plus the Commercial Chain
 * and Serial Integrity tabs (stage 06).
 *
 * The Procurement Match tab used to live here and now lives at `/procurement`
 * (COMPLETION_PLAN Stage C), alongside the four other buy-side populations it
 * belongs with. Nothing about it was rebuilt — the cards, legs and the
 * native-vs-close separation moved intact to `procurement-view.ts`.
 */

/**
 * The financial bridge.
 *
 * Every figure comes from `getReconciliation()` and `getAdjustmentRegister()`
 * — this function formats and labels, it never adds money up. The posted and
 * potential states are separate panels because they are different kinds of
 * claim: one is recorded in NetSuite today, the other is what would be true
 * if management approved and posted proposals that nobody has approved or
 * posted.
 */
function buildFinancialBridge(
  recon: ReconciliationOut,
  register: AdjustmentRegisterOut | undefined,
  exceptions: readonly ExceptionView[],
  manifest: { runId: string; datasetVersion: string } | undefined,
  ruleExecutions: readonly { ruleId: unknown; ruleVersion: string; result: string; coverage: string }[],
  drawerFor: (view: ExceptionView | undefined) => string | null,
): FinancialBridgeData {
  const viewFor = (id: string) => exceptions.find((e) => e.exception.id === id);
  const entries = register?.entries ?? [];
  const openEntries = entries.filter((e) => e.exceptionOpen);
  const undrafted = entries.filter((e) => e.proposal === undefined);
  const potentialDifferenceCents = recon.potentialAdjustedGlCents - recon.subledgerCents;
  // "item", never "proposal": three items are identified and only two carry a
  // drafted entry, and the same panel says so. Calling all three proposals
  // would assert a journal entry that does not exist.
  const noun = (n: number) => `${n} item${n === 1 ? "" : "s"}`;

  const rows: BridgeRow[] = [
    {
      key: "opening",
      kind: "opening",
      id: null,
      label: "Current GL difference",
      detail: "Starting position — gross GL over subledger",
      amount: formatCents(recon.differenceCents),
      ember: false,
      status: null,
      posted: "RECORDED",
      exceptionId: null,
      href: null,
    },
  ];

  for (const item of recon.items) {
    const entry = entries.find((e) => e.reconcilingItemId === item.id);
    const view = viewFor(item.relatedExceptionId);
    const open = view?.open ?? false;
    rows.push({
      key: item.id,
      kind: "item",
      id: item.relatedExceptionId,
      label: item.description,
      // Say whether an entry exists rather than implying one does. An
      // identified difference with no drafted entry is its own state.
      detail:
        entry?.proposal !== undefined
          ? `${entry.proposal.id} · prepared, ${entry.proposal.lines.length} balanced lines`
          : (entry?.undraftedReason ?? "No entry drafted."),
      amount: formatCents(item.amountCents),
      ember: open,
      status: view !== undefined ? statusView(view.exception.status) : null,
      posted: "NOT POSTED",
      exceptionId: drawerFor(view),
      href: `/exceptions/${item.relatedExceptionId}`,
    });
  }

  rows.push(
    {
      key: "net",
      kind: "net",
      id: null,
      label: "Net potential adjustment",
      detail: `If all ${noun(recon.items.length)} were adjusted and posted`,
      amount: formatCents(recon.explainedCents),
      ember: false,
      status: null,
      posted: "—",
      exceptionId: null,
      href: null,
    },
    {
      key: "total",
      kind: "total",
      id: null,
      label: "Potential adjusted difference",
      // The reason it is unreachable is the real one, counted from state.
      detail:
        openEntries.length > 0 || undrafted.length > 0
          ? `Not reachable — ${[
              openEntries.length > 0
                ? `${openEntries.length} exception${openEntries.length === 1 ? "" : "s"} open`
                : null,
              undrafted.length > 0
                ? `${undrafted.length} with no entry drafted`
                : null,
            ]
              .filter((s) => s !== null)
              .join(", ")}`
          : "Every item has a prepared entry awaiting approval",
      amount: formatCents(potentialDifferenceCents),
      ember: false,
      status: null,
      posted: "HYPOTHETICAL",
      exceptionId: null,
      href: null,
    },
  );

  const reducing = recon.items.filter((i) => i.amountCents < 0).length;
  const increasing = recon.items.filter((i) => i.amountCents > 0).length;
  const recGl = ruleExecutions.find((e) => String(e.ruleId) === "REC-GL-001");

  return {
    posted: {
      tag: "NETSUITE · READ-ONLY",
      figures: [
        {
          label: "Gross subledger",
          value: formatCents(recon.subledgerCents),
          note: null,
          emphasis: false,
          ember: false,
        },
        {
          label: "Gross GL",
          value: formatCents(recon.grossGlCents),
          note: null,
          emphasis: false,
          ember: false,
        },
        {
          // The direction is stated in words and derived from the sign, so
          // the sentence cannot drift from the figure it describes. "Ledger
          // difference" alone never says which side is larger.
          label:
            recon.differenceCents === 0
              ? "Subledger agrees with GL"
              : recon.differenceCents > 0
                ? "GL exceeds subledger"
                : "Subledger exceeds GL",
          value: formatCents(Math.abs(recon.differenceCents)),
          note: "Gross of reserves",
          emphasis: true,
          ember: recon.differenceCents !== 0,
        },
      ],
      footnote:
        "This is what is recorded today. Nothing on this page has been posted to NetSuite, and Gaurd has no path that could post it.",
    },
    // Posted is its own statement, not an inference from the absence of one.
    // A reader who sees only "current" and "potential" can be left believing
    // something in between has already been booked.
    postedAdjustments: {
      label: "Posted adjustments",
      value: formatCents(0),
      note:
        register !== undefined
          ? `${register.postedCount} of the ${register.identifiedCount} identified items are posted. Posting happens in NetSuite; this product has no path that could do it.`
          : "Nothing identified here has been posted.",
    },
    potential: {
      tag: "NOT POSTED · MANAGEMENT VIEW",
      figures: [
        {
          label: "Net potential adjustment",
          value: formatCents(recon.explainedCents),
          note: null,
          emphasis: false,
          ember: false,
        },
        {
          label: "Potential adjusted GL",
          value: formatCents(recon.potentialAdjustedGlCents),
          note: null,
          emphasis: false,
          ember: false,
        },
        {
          label: "Potential adjusted difference",
          value: formatCents(potentialDifferenceCents),
          note: "Hypothetical — not a recorded balance",
          emphasis: true,
          ember: false,
        },
      ],
      // The figures apply EVERY identified item, not every drafted entry —
      // saying "every proposal" would promise this outcome from the two
      // entries that exist, which would instead leave the third item's
      // difference standing.
      footnote: `A management view of what would be true if all ${noun(recon.items.length)} identified here were adjusted and posted. ${
        register !== undefined
          ? `Only ${register.draftedCount} of the ${register.identifiedCount} carry a prepared entry today, and ${register.postedCount} are posted.`
          : ""
      }`,
    },
    bridge: {
      summary:
        register !== undefined
          ? `${register.identifiedCount} identified · ${register.draftedCount} drafted · ${register.postedCount} posted`
          : `${recon.items.length} identified`,
      rows,
    },
    direction: `${noun(reducing)} would reduce the GL and ${noun(increasing)} would increase it. They net to the current difference by coincidence of this period's facts — not because the bridge was balanced to it.`,
    reserves:
      "All figures on this tab are gross. Reserve conclusions are held in Valuation and are not netted here.",
    // A residual would mean the identified items do not explain the whole
    // difference. It renders only when there is one.
    unexplained:
      recon.unexplainedCents === 0
        ? null
        : `${formatCents(recon.unexplainedCents)} of the difference is not explained by any identified item.`,
    audit: [
      ...(recGl !== undefined
        ? [
            { k: "Rule", v: `${String(recGl.ruleId)} · v${recGl.ruleVersion}` },
            { k: "Coverage", v: `${recGl.result} / ${recGl.coverage}` },
          ]
        : []),
      { k: "As of", v: formatDate(recon.asOf) },
      ...(manifest !== undefined
        ? [
            { k: "Run", v: manifest.runId },
            { k: "Dataset", v: manifest.datasetVersion },
          ]
        : []),
    ],
  };
}

/* ---------------- Inventory GL accounts (Financial tab) ---------------- */

/**
 * One inventory GL account. Every figure is formatted from
 * `getGlAccountReconciliation()`; nothing on this row is added up here.
 */
export interface GlAccountRowView {
  readonly account: string;
  readonly description: string;
  /** Units and the accounting classifications that land in this account. */
  readonly basis: string;
  readonly subledger: string;
  readonly gl: string;
  readonly difference: string;
  readonly differenceEmber: boolean;
  readonly exceptions: readonly { id: string; href: string; open: boolean }[];
  /** Rendered instead of links when no reconciling item sits here. */
  readonly exceptionsNote: string | null;
  readonly exceptionsEmber: boolean;
  /**
   * Per-account RECONCILIATION state — whether this account's recorded
   * balance agrees with its subledger. Deliberately not a `StatusView`: the
   * capsule component carries exception workflow status, and these two must
   * never be read as the same kind of claim.
   */
  readonly state: { label: string; glyph: string; variant: "frost" | "aurora" };
}

export interface GlAccountsData {
  readonly summary: string;
  readonly rows: readonly GlAccountRowView[];
  readonly total: {
    readonly label: string;
    readonly detail: string;
    readonly subledger: string;
    readonly gl: string;
    readonly difference: string;
    readonly differenceEmber: boolean;
  };
  readonly reserve: {
    readonly label: string;
    readonly value: string;
    readonly note: string;
  } | null;
  /** Rendered only when an item cannot be placed on a single account. */
  readonly unattributed: string | null;
  readonly stateNote: string;
}

const GL_ACCOUNT_STATES: Readonly<
  Record<string, { label: string; glyph: string; variant: "frost" | "aurora" }>
> = {
  RECONCILED: { label: "Reconciled", glyph: "✓", variant: "aurora" },
  OPEN_RECONCILING_ITEMS: { label: "Open reconciling items", glyph: "◆", variant: "frost" },
  DIFFERENCE_NOT_EXPLAINED: { label: "Difference not explained", glyph: "○", variant: "frost" },
};

/**
 * The per-account cut of the same reconciliation the bridge above states in
 * total. The bridge answers "does inventory tie to the GL"; this answers
 * "which account is out, and what is sitting in it".
 *
 * Two things this function will not do. It never nets 1290 into the gross
 * accounts — the reserve is reported on its own, out of the totals, exactly
 * as the deterministic core holds it. And the Status column is a
 * reconciliation state, never an exception workflow status: nothing here
 * concludes anything, and no row on this table can become a blocker.
 */
function buildGlAccounts(
  view: GlAccountReconciliationOut,
  identifiedCount: number,
): GlAccountsData {
  const units = (n: number) => `${n.toLocaleString("en-US")} unit${n === 1 ? "" : "s"}`;
  const rows: GlAccountRowView[] = view.accounts.map((account) => {
    const classes = account.classifications.map(classificationLabel).join(", ");
    return {
      account: account.account,
      description: account.description,
      basis: `${units(account.unitCount)} · ${classes}`,
      subledger: formatCents(account.subledgerCents),
      gl: formatCents(account.glCents),
      difference: formatCents(account.differenceCents),
      differenceEmber: account.differenceCents !== 0,
      exceptions: account.items.map((item) => ({
        id: item.relatedExceptionId,
        href: `/exceptions/${item.relatedExceptionId}`,
        open: item.exceptionOpen,
      })),
      // "None" is a checked result, not an assumption: the items were
      // matched to accounts through their GL entries, and none reached here.
      exceptionsNote:
        account.items.length > 0
          ? null
          : account.differenceCents === 0
            ? "None"
            : "None identified",
      exceptionsEmber: account.items.length === 0 && account.differenceCents !== 0,
      state: GL_ACCOUNT_STATES[account.state] ?? {
        label: account.state,
        glyph: "○",
        variant: "frost",
      },
    };
  });

  const totalUnits = view.accounts.reduce((n, a) => n + a.unitCount, 0);

  return {
    summary: `${view.accounts.length} gross accounts${
      view.reserve !== null ? ` · ${view.reserve.account} separate` : ""
    }`,
    rows,
    total: {
      label: "Gross inventory",
      detail: `${units(totalUnits)} across ${view.accounts.length} accounts — the totals the bridge above reconciles`,
      subledger: formatCents(view.subledgerCents),
      gl: formatCents(view.grossGlCents),
      difference: formatCents(view.differenceCents),
      differenceEmber: view.differenceCents !== 0,
    },
    reserve:
      view.reserve === null
        ? null
        : {
            label: `${view.reserve.description} · ${view.reserve.account}`,
            value: formatCents(view.reserve.glCents),
            note: "A recorded credit balance with no unit-level subledger behind it. It is excluded from the gross bridge and is never netted into the accounts above; this period's reserve conclusion is held in Valuation.",
          },
    unattributed:
      view.unattributedItems.length === 0
        ? null
        : `${view.unattributedItems.length} of the ${identifiedCount} identified items (${view.unattributedItems
            .map((i) => i.relatedExceptionId)
            .join(", ")}) could not be placed on a single account from their GL entries, and are not included in any row above.`,
    stateNote:
      "Status is a reconciliation state — whether an account's recorded balance agrees with its subledger. It is not an exception workflow status and it concludes nothing: the related exceptions are the same items the bridge above lists, each with its own management conclusion.",
  };
}

export function buildReconciliationData(
  user: DemoUser,
  serialQuery: string,
  correlationId: string,
): ReconciliationData & { glAccounts: GlAccountsData | null } {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const chains = attempt(() => queries.getCommercialChains(ctx));
  if (chains === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      tabs: [],
      financial: null,
      commercial: null,
      serialTab: { query: "", notable: [], card: null, notFound: null },
      drawers: {},
      records: {},
      glAccounts: null,
    };
  }

  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const recon = attempt(() => queries.getReconciliation(ctx));
  const register = attempt(() => queries.getAdjustmentRegister(ctx));
  const manifest = attempt(() => queries.getRunManifest(ctx));
  const ruleExecutions = attempt(() => queries.getRuleExecutions(ctx)) ?? [];
  // The per-account cut is a read-only projection over the same workspace,
  // authorized on the same permission key as every other close read.
  const glAccounts = attempt(() => getGlAccountReconciliation(getWorkspace(), ctx));
  const periodEnd = recon?.asOf;

  const drawers: Record<string, ExceptionDrawerData> = {};
  const records: Record<string, EvidenceRecordView> = {};
  const drawerFor = (view: ExceptionView | undefined): string | null => {
    if (view === undefined) return null;
    const id = view.exception.id;
    if (drawers[id] === undefined) {
      drawers[id] = assembleDrawer(
        gatherExceptionContext(queries, ctx, view),
        blockerIds.has(id),
      );
    }
    return id;
  };
  const byTransaction = (...refs: (string | undefined)[]): ExceptionView | undefined =>
    exceptions.find((e) =>
      refs.some(
        (ref) =>
          ref !== undefined &&
          (e.exception.finding.subjects.transactionNumbers?.includes(ref) ?? false),
      ),
    );

  /* ---------------- Commercial Chain tab ---------------- */

  const chainException = (chain: TransactionChain): ExceptionView | undefined =>
    byTransaction(chain.subjectRef) ??
    exceptions.find((e) =>
      chain.components.some(
        (c) =>
          c.reference !== undefined &&
          (e.exception.finding.subjects.transactionNumbers?.includes(c.reference) ?? false),
      ),
    );

  // Featured chain: the open-exception chain with the largest exposure.
  const featuredChain = chains
    .map((c) => ({ c, view: chainException(c) }))
    .filter((x) => x.view !== undefined && x.view.open)
    .sort(
      (a, b) =>
        (b.view?.exception.finding.exposureCents ?? 0) -
        (a.view?.exception.finding.exposureCents ?? 0),
    )[0];

  let commercialFeatured: NonNullable<
    NonNullable<ReconciliationData["commercial"]>["featured"]
  > | null = null;
  if (featuredChain !== undefined && featuredChain.view !== undefined) {
    const { c, view } = featuredChain;
    const f = view.exception.finding;
    const context = gatherExceptionContext(queries, ctx, view);
    const datasetVersion = manifest?.datasetVersion ?? "—";
    const evidenceByRef = new Map<string, string>();
    for (const item of context.evidence) {
      records[item.id] = assembleEvidenceRecord(item, view, datasetVersion, user);
      evidenceByRef.set(item.title, item.id);
      if (item.internalId !== undefined) evidenceByRef.set(item.internalId, item.id);
    }
    const nodes: ChainNodeView[] = assembleChainNodes(
      c.components.filter((comp) => comp.state !== "NOT_APPLICABLE"),
      evidenceByRef,
    );
    const serials = f.subjects.serials ?? [];
    const requiredMissing = c.components.filter(
      (comp) => comp.state === "MISSING" && comp.importance === "REQUIRED",
    );
    const operational = c.components.filter((comp) =>
      ["Sales Order", "Item Fulfillment", "Delivery"].includes(comp.name),
    );
    const operationalComplete = operational.every((comp) => comp.state === "PRESENT");
    const telemetry = c.components.find((comp) => comp.name.startsWith("Telemetry"));
    const reliefNote = c.components.find((comp) => comp.name === "Inventory relief")?.note;

    commercialFeatured = {
      subject: c.subjectRef,
      subNote: `${view.exception.id}${serials.length > 0 ? ` · ${serials[0]}` : ""} · ${formatCents(f.exposureCents)}${serials.length > 1 ? ` across ${serials.length} units` : ""}`,
      exceptionId: drawerFor(view),
      nodes,
      summary: `${c.presentCount} of ${c.totalCount} components present — completeness is not a conclusion.`,
      completeness: {
        big: `${c.presentCount} of ${c.totalCount}`,
        rows: [
          {
            glyph: operationalComplete ? "✓" : "◆",
            tone: operationalComplete ? "aurora" : "warn",
            label: "Operational sequence",
            value: operationalComplete ? "Complete and consistent" : "Incomplete",
            ember: false,
          },
          ...(telemetry !== undefined && telemetry.state !== "NOT_APPLICABLE"
            ? [
                {
                  glyph: "≈",
                  tone: "frost",
                  label: "Corroborating telemetry",
                  value: telemetry.state === "PRESENT" ? "Present" : "Absent",
                  ember: false,
                },
              ]
            : []),
          ...requiredMissing.map((comp) => ({
            glyph: "○",
            tone: "ember",
            label: comp.name,
            value: "Missing — required",
            ember: true,
          })),
        ],
        footnote:
          "Completeness counts components. It does not weigh them, and it is not a confidence score.",
      },
      accounting: {
        big: conclusionLabel(view.exception.status),
        sub: statusView(view.exception.status).label,
        rows: [
          ...(reliefNote !== undefined
            ? [{ k: "Inventory relief", v: reliefNote }]
            : []),
          { k: "Exposure", v: formatCents(f.exposureCents) },
          {
            k: "Proposed adjustment",
            v:
              view.exception.status === "RESOLVED_ADJUSTMENT_PROPOSED"
                ? "Proposed — not posted"
                : "None at baseline",
          },
        ],
        footnote:
          "A nearly complete chain and an unresolved accounting conclusion are not in tension — the absent component is the one the conclusion depends on.",
      },
    };
  }

  const others = chains
    .filter((c) => c.subjectRef !== commercialFeatured?.subject)
    .map((c) => {
      const view = chainException(c);
      const missingRequired = c.components
        .filter((comp) => comp.state === "MISSING" && comp.importance === "REQUIRED")
        .map((comp) => comp.name);
      return {
        subject: c.subjectRef,
        customer: null,
        presence: `${c.presentCount} / ${c.totalCount}`,
        requiredMissing: c.requiredMissingCount,
        note:
          missingRequired.length > 0 ? `Missing required: ${missingRequired.join(", ")}` : null,
        exceptionId: drawerFor(view),
      };
    })
    .sort((a, b) => {
      if ((b.requiredMissing > 0 ? 1 : 0) !== (a.requiredMissing > 0 ? 1 : 0)) {
        return (b.requiredMissing > 0 ? 1 : 0) - (a.requiredMissing > 0 ? 1 : 0);
      }
      return a.subject < b.subject ? -1 : 1;
    });

  /* ---------------- Serial Integrity tab ---------------- */

  const notable = [
    ...new Set(
      exceptions
        .filter((e) => e.open)
        .flatMap((e) => e.exception.finding.subjects.serials ?? []),
    ),
  ].slice(0, 5);

  const trimmed = serialQuery.trim().toUpperCase();
  let card: NonNullable<ReconciliationData["serialTab"]>["card"] = null;
  let notFound: string | null = null;
  if (trimmed !== "") {
    const life = attempt(() => queries.getFinancialLife(ctx, trimmed));
    const hits = attempt(() => queries.searchSerial(ctx, trimmed)) ?? [];
    const exact = hits.find((h) => h.serial === trimmed);
    const anyTrace =
      life !== undefined &&
      (life.unit !== undefined ||
        Object.keys(life.records).length > 0 ||
        life.inventoryLife.countTests.length > 0 ||
        life.exceptions.length > 0 ||
        exact !== undefined);
    if (life === undefined || !anyTrace) {
      notFound = `No source in the dataset references ${trimmed} — verified empty, not assumed.`;
    } else {
      const linked = exceptions.filter((e) => life.exceptions.includes(e.exception.id));
      // Every year-end row, not the first: a serial counted in two locations
      // has two, and reporting only one hides the reason it is an exception.
      const yeRows = life.inventoryLife.countRows.filter(
        (r) => r.countType === "YEAR_END",
      );
      const yeRow = yeRows[0];
      const countClean = yeRows.length > 0 && yeRows.every((r) => r.variance === 0);
      const deployed =
        life.sellSide.installedAt ?? life.sellSide.firstOnlineAt;
      const chain =
        life.sellSide.salesOrder !== undefined
          ? chains.find((ch) => ch.subjectRef === life.sellSide.salesOrder)
          : undefined;
      const observation = life.inventoryLife.countTests[0];

      const chainRows: {
        type: string;
        value: string;
        state: string;
        glyph: string;
        missing: boolean;
      }[] = [];
      const addRow = (
        type: string,
        ref: string | undefined,
        date: string | undefined,
        state = "PRESENT",
        glyph = "✓",
      ) => {
        if (ref === undefined) return;
        chainRows.push({
          type,
          value: `${ref}${date !== undefined ? ` · ${formatDate(date)}` : ""}`,
          state,
          glyph,
          missing: false,
        });
      };
      addRow("PURCHASE ORDER", life.buySide.purchaseOrder, life.records.purchaseOrder?.orderDate);
      addRow("ITEM RECEIPT", life.buySide.itemReceipt, life.records.itemReceipt?.receiptDate);
      addRow("SALES ORDER", life.sellSide.salesOrder, life.records.salesOrder?.orderDate);
      addRow(
        "ITEM FULFILLMENT",
        life.sellSide.itemFulfillment,
        life.records.itemFulfillment?.shipDate,
      );
      if (life.sellSide.deliveredAt !== undefined || life.sellSide.installedAt !== undefined) {
        chainRows.push({
          type: "DELIVERY / INSTALL",
          value: [
            life.sellSide.deliveredAt !== undefined
              ? formatDate(life.sellSide.deliveredAt)
              : null,
            life.sellSide.installedAt !== undefined
              ? formatDate(life.sellSide.installedAt)
              : null,
          ]
            .filter((x) => x !== null)
            .join(" / "),
          state: "PRESENT",
          glyph: "✓",
          missing: false,
        });
      }
      addRow(
        "CUSTOMER INVOICE",
        life.sellSide.customerInvoice,
        life.records.customerInvoice?.invoiceDate,
        "BILLING ONLY",
        "✓",
      );
      for (const e of linked) {
        for (const req of e.exception.finding.evidenceRequirements) {
          if (!req.required || req.satisfied) continue;
          chainRows.push({
            type: "REQUIRED EVIDENCE",
            value: req.description,
            state: "MISSING",
            glyph: "○",
            missing: true,
          });
        }
      }

      card = {
        serial: trimmed,
        // Off-book serials still have a SKU on the observation that found them.
        sku: life.unit?.sku ?? life.inventoryLife.countTests[0]?.sku ?? "—",
        carrying: life.unit !== undefined ? formatCents(life.unit.unitCostCents) : null,
        onBook: life.unit !== undefined,
        facts: [
          {
            label: "NETSUITE LOCATION",
            value:
              life.unit !== undefined ? locationLabel(life.unit.location) : "Not on listing",
            sub:
              life.unit !== undefined
                ? `${yeRow?.bin !== undefined ? `Bin ${yeRow.bin} · ` : ""}at ${periodEnd !== undefined ? formatDate(periodEnd) : "period end"}`
                : "No book record exists",
            ember: life.unit === undefined,
          },
          {
            label: "PHYSICAL EVIDENCE",
            value:
              deployed !== undefined
                ? "Customer site"
                : observation !== undefined
                  ? locationLabel(observation.location)
                  : countClean && yeRow !== undefined
                    ? locationLabel(yeRow.location)
                    : (countOutcome(yeRows) ?? "No operational events"),
            sub:
              deployed !== undefined
                ? `Installed${life.sellSide.firstOnlineAt !== undefined ? " and online" : ""} ${formatDateShort(deployed)}`
                : observation !== undefined
                  ? observation.observation
                  : countClean
                    ? "Matched in the year-end count"
                    : yeRows.length > 0
                      ? countOutcomeDetail(yeRows)
                      : "Nothing places this unit elsewhere",
            // A count that did not find the unit is a flagged fact, not a quiet one.
            ember:
              (deployed !== undefined && life.unit !== undefined) ||
              (yeRows.length > 0 && !countClean),
          },
          {
            label: "LAST COUNT",
            value:
              yeRow !== undefined
                ? periodEnd !== undefined
                  ? formatDate(periodEnd)
                  : "Year-end"
                : "None on file",
            sub:
              yeRows.length > 1
                ? `${yeRows.length} year-end rows · ${yeRows.map((r) => `${locationLabel(r.location)} ${r.variance > 0 ? "+" : ""}${r.variance}`).join(", ")}`
                : yeRow !== undefined
                  ? `Variance ${yeRow.variance} · ${titleCase(yeRow.countType)} count`
                  : "No count rows reference this serial",
            ember: false,
          },
        ],
        jump: [
          { label: "Financial Life", meta: trimmed, href: `/inventory/${trimmed}` },
          ...(chain !== undefined
            ? [
                {
                  label: "Transaction chain",
                  meta: `${chain.presentCount} / ${chain.totalCount}`,
                  href: `/inventory/${trimmed}`,
                },
              ]
            : []),
          { label: "Count history", meta: "PHYSICAL COUNT", href: "/physical-count" },
          ...(linked.length > 0
            ? [
                {
                  label: "Related exceptions",
                  meta: `${linked.filter((e) => e.open).length} OPEN`,
                  href: `/exceptions/${linked[0]?.exception.id ?? ""}`,
                },
              ]
            : []),
        ],
        chainRows,
        related: linked.map((e) => ({
          id: e.exception.id,
          status: statusView(e.exception.status),
          exposure: formatCents(e.exception.finding.exposureCents),
          note: e.exception.finding.title,
        })),
        relatedEmpty:
          linked.length === 0
            ? `No exceptions reference this serial. Checked against all ${exceptions.length} designed exceptions${manifest !== undefined ? ` at ${manifest.runId}` : ""} — verified empty, not assumed.`
            : null,
      };
    }
  }

  const tabs: TabDef[] = [
    {
      key: "financial",
      label: "Financial",
      count: recon !== undefined ? formatCents(recon.differenceCents) : null,
    },
    { key: "commercial", label: "Commercial Chain", count: String(chains.length) },
    { key: "serial", label: "Serial Integrity", count: null },
  ];

  return {
    restricted: false,
    roleLabel: role,
    headerNote:
      recon !== undefined ? `Current difference ${formatCents(recon.differenceCents)}` : null,
    tabs,
    financial:
      recon !== undefined
        ? buildFinancialBridge(
            recon,
            register,
            exceptions,
            manifest,
            ruleExecutions,
            drawerFor,
          )
        : null,
    commercial: {
      featured: commercialFeatured,
      others,
    },
    serialTab: { query: trimmed, notable, card, notFound },
    drawers,
    records,
    glAccounts:
      glAccounts !== undefined
        ? buildGlAccounts(glAccounts, recon?.items.length ?? glAccounts.accounts.length)
        : null,
  };
}
