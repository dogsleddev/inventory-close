import type { DemoUser } from "@icg/data";
import type { TransactionChain } from "@icg/domain";
import type {
  AdjustmentRegisterOut,
  ExceptionView,
  ProcurementDetail,
  ReconciliationOut,
} from "@icg/services";
import { formatCents, formatDate, formatDateShort } from "../format";
import type {
  BridgeRow,
  ChainNodeView,
  EvidenceRecordView,
  ExceptionDrawerData,
  FinancialBridgeData,
  ProcurementCard,
  ProcurementLeg,
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
import { locationLabel, titleCase } from "./humanize";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Reconciliation — the Financial bridge (stage 07) plus the Procurement
 * Match, Commercial Chain, and Serial Integrity tabs (stage 06). The native
 * NetSuite match state and the close-control state are separate columns
 * everywhere; neither is ever derived from the other here.
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
      detail: `If all ${recon.items.length} were approved and posted`,
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
          label: "Current difference",
          value: formatCents(recon.differenceCents),
          note: "GL over subledger, gross of reserves",
          emphasis: true,
          ember: true,
        },
      ],
      footnote:
        "This is what is recorded today. Nothing on this page has been posted to NetSuite, and Gaurd has no path that could post it.",
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
      footnote: `A management view of what would be true if every proposal were approved and posted. ${
        register !== undefined
          ? `${register.draftedCount} of ${register.identifiedCount} identified items carry a prepared entry and ${register.postedCount} are posted.`
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
    direction: `${reducing} proposal${reducing === 1 ? "" : "s"} reduce the GL and ${increasing} increase${increasing === 1 ? "s" : ""} it. They net to the current difference by coincidence of this period's facts — not because the bridge was balanced to it.`,
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

/**
 * Document totals arrive from `getProcurementDetail().totals` — the web app
 * formats money, it never adds it up. An absent total renders as absent.
 */
const money = (cents: number | undefined): string | null =>
  cents === undefined ? null : formatCents(cents);

/**
 * The close-control capsule. "No close exception" is a negative claim, so it
 * may only be made when no exception references the match at all — a match
 * whose exception is RESOLVED still has one, and it may carry an unposted
 * proposed adjustment that the reader must be able to reach.
 */
function closeCapsule(
  status: string,
  view?: ExceptionView | undefined,
): {
  label: string;
  glyph: string;
  variant: "frost" | "aurora";
} {
  if (view !== undefined) {
    return view.open
      ? { label: statusView(view.exception.status).label, glyph: "◆", variant: "frost" }
      : { label: statusView(view.exception.status).label, glyph: "✓", variant: "aurora" };
  }
  return status === "PASS"
    ? { label: "No close exception", glyph: "✓", variant: "aurora" }
    : { label: "Review required", glyph: "◆", variant: "frost" };
}

export function buildReconciliationData(
  user: DemoUser,
  serialQuery: string,
  correlationId: string,
): ReconciliationData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const role = roleLabel(user);

  const matches = attempt(() => queries.getProcurementMatches(ctx));
  const chains = attempt(() => queries.getCommercialChains(ctx));
  if (matches === undefined || chains === undefined) {
    return {
      restricted: true,
      roleLabel: role,
      headerNote: null,
      tabs: [],
      financial: null,
      procurement: null,
      commercial: null,
      serialTab: { query: "", notable: [], card: null, notFound: null },
      drawers: {},
      records: {},
    };
  }

  const exceptions = attempt(() => queries.listExceptions(ctx)) ?? [];
  const blockers = attempt(() => queries.getBlockers(ctx)) ?? [];
  const blockerIds = new Set(blockers.map((b) => b.exceptionId));
  const recon = attempt(() => queries.getReconciliation(ctx));
  const register = attempt(() => queries.getAdjustmentRegister(ctx));
  const manifest = attempt(() => queries.getRunManifest(ctx));
  const ruleExecutions = attempt(() => queries.getRuleExecutions(ctx)) ?? [];
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

  /* ---------------- Procurement Match tab ---------------- */

  const details = new Map<string, ProcurementDetail>();
  const detailFor = (po: string): ProcurementDetail => {
    let d = details.get(po);
    if (d === undefined) {
      d = attempt(() => queries.getProcurementDetail(ctx, po)) ?? { totals: {} };
      details.set(po, d);
    }
    return d;
  };

  const nativePass = matches.filter((m) => m.nativeNetsuiteMatchStatus === "PASS").length;
  const closeOpen = matches.filter((m) => m.closeMatchStatus !== "PASS").length;

  const poLeg = (d: ProcurementDetail): ProcurementLeg => {
    const po = d.purchaseOrder;
    if (po === undefined) {
      return {
        label: "PURCHASE ORDER",
        glyph: "○",
        value: "No record",
        note: "",
        missing: true,
      };
    }
    const amount = money(d.totals.purchaseOrderCents);
    const qty = d.totals.purchaseOrderQuantity;
    const skus = [...new Set(po.lines.map((l) => l.sku))].join(", ");
    return {
      label: "PURCHASE ORDER",
      glyph: "✓",
      value: `${po.transactionNumber} · ${formatDateShort(po.orderDate)}`,
      note: `${po.vendor}${qty !== undefined ? ` · ${qty} × ${skus}` : ""}${amount !== null ? ` · ${amount}` : ""}`,
      missing: false,
    };
  };
  const irLeg = (d: ProcurementDetail): ProcurementLeg => {
    const ir = d.itemReceipt;
    if (ir === undefined) {
      return {
        label: "ITEM RECEIPT",
        glyph: "○",
        value: "No record",
        note: "No item receipt references this order",
        missing: true,
      };
    }
    const inPeriod = periodEnd === undefined || ir.receiptDate <= periodEnd;
    return inPeriod
      ? {
          label: "ITEM RECEIPT",
          glyph: "✓",
          value: `${ir.transactionNumber} · ${formatDateShort(ir.receiptDate)}`,
          note: "Received and recorded in period",
          missing: false,
        }
      : {
          label: "ITEM RECEIPT",
          glyph: "○",
          value: `Absent at ${periodEnd !== undefined ? formatDateShort(periodEnd) : "period end"}`,
          note: `Recorded ${formatDate(ir.receiptDate)}`,
          missing: true,
        };
  };
  const vbLeg = (d: ProcurementDetail): ProcurementLeg => {
    const vb = d.vendorBill;
    if (vb === undefined) {
      return {
        label: "VENDOR BILL",
        glyph: "○",
        value: "No record",
        note: "No vendor bill references this order",
        missing: true,
      };
    }
    const amount = money(d.totals.vendorBillCents);
    return {
      label: "VENDOR BILL",
      glyph: "✓",
      value: `${vb.transactionNumber} · ${formatDateShort(vb.billDate)}`,
      note: `Received and recorded${amount !== null ? ` · ${amount}` : ""}`,
      missing: false,
    };
  };

  const buildCard = (
    poNumber: string,
    title: string,
    tone: "ember" | "clean" | "resolved",
    view: ExceptionView | undefined,
  ): ProcurementCard => {
    const match = matches.find((m) => m.purchaseOrderNumber === poNumber);
    const d = detailFor(poNumber);
    const po = d.purchaseOrder;
    const qty = d.totals.purchaseOrderQuantity;
    const skus = po !== undefined ? [...new Set(po.lines.map((l) => l.sku))].join(", ") : "";
    const amount = money(d.totals.purchaseOrderCents);
    const f = view?.exception.finding;
    return {
      key: poNumber,
      po: poNumber,
      title,
      qtyAmount:
        qty !== undefined ? `${qty} × ${skus}${amount !== null ? ` · ${amount}` : ""}` : null,
      nsTag: `NS 3WM · ${match?.nativeNetsuiteMatchStatus ?? "—"}`,
      close: closeCapsule(match?.closeMatchStatus ?? "PASS", view),
      ember: tone === "ember",
      legs: [poLeg(d), irLeg(d), vbLeg(d)],
      footnote:
        view !== undefined
          ? {
              glyph: view.open ? "✕" : "✓",
              tone: view.open ? "ember" : "aurora",
              text: `${f?.whyFlagged ?? ""} ${view.exception.id} · ${f !== undefined ? formatCents(f.exposureCents) : ""} · ${statusView(view.exception.status).label}.`,
            }
          : {
              glyph: "✓",
              tone: "aurora",
              text: "All three legs present and matched before year-end, and no cutoff or ownership question arises. Native match and close control agree here — the normal case, and the reason the two are still reported separately.",
            },
      exceptionId: drawerFor(view),
    };
  };

  // Featured cards, all derived from service state: every close-open match
  // (EXC-002), the resolved-historical timing example, and the largest clean
  // cycle for contrast.
  const featured: ProcurementCard[] = [];
  for (const m of matches) {
    if (m.closeMatchStatus === "PASS") continue;
    const view = byTransaction(m.purchaseOrderNumber, m.itemReceiptNumber, m.vendorBillNumber);
    featured.push(
      buildCard(
        m.purchaseOrderNumber,
        view?.exception.finding.title ?? "Open close question",
        "ember",
        view,
      ),
    );
  }
  const resolvedHistorical = matches.find((m) => {
    if (m.closeMatchStatus !== "PASS") return false;
    const view = byTransaction(m.purchaseOrderNumber, m.itemReceiptNumber, m.vendorBillNumber);
    return view !== undefined && !view.open;
  });
  if (resolvedHistorical !== undefined) {
    const view = byTransaction(
      resolvedHistorical.purchaseOrderNumber,
      resolvedHistorical.itemReceiptNumber,
      resolvedHistorical.vendorBillNumber,
    );
    featured.push(
      buildCard(
        resolvedHistorical.purchaseOrderNumber,
        view?.exception.finding.title ?? "Resolved historical question",
        "resolved",
        view,
      ),
    );
  }
  const clean = matches
    .filter(
      (m) =>
        m.nativeNetsuiteMatchStatus === "PASS" &&
        m.closeMatchStatus === "PASS" &&
        byTransaction(m.purchaseOrderNumber, m.itemReceiptNumber, m.vendorBillNumber) ===
          undefined,
    )
    .map((m) => ({
      m,
      amount: detailFor(m.purchaseOrderNumber).totals.purchaseOrderCents ?? 0,
    }))
    .sort((a, b) =>
      b.amount !== a.amount
        ? b.amount - a.amount
        : a.m.purchaseOrderNumber < b.m.purchaseOrderNumber
          ? -1
          : 1,
    )[0];
  if (clean !== undefined) {
    featured.push(
      buildCard(clean.m.purchaseOrderNumber, "Clean procurement cycle", "clean", undefined),
    );
  }

  const procurementRows = matches.map((m) => {
    // Every match is checked against the exception population, not only the
    // close-open ones: a resolved exception is still an exception, and its
    // row must reach it.
    const view = byTransaction(
      m.purchaseOrderNumber,
      m.itemReceiptNumber,
      m.vendorBillNumber,
    );
    return {
      po: m.purchaseOrderNumber,
      ir: m.itemReceiptNumber ?? "—",
      vb: m.vendorBillNumber ?? "—",
      native: `NS 3WM · ${m.nativeNetsuiteMatchStatus}`,
      close: closeCapsule(m.closeMatchStatus, view),
      exceptionId: drawerFor(view),
    };
  });

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
    { key: "procurement", label: "Procurement Match", count: String(matches.length) },
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
    procurement: {
      nativeSummary: `${nativePass} / ${matches.length}`,
      closeSummary: `${closeOpen} open`,
      featured,
      rows: procurementRows,
    },
    commercial: {
      featured: commercialFeatured,
      others,
    },
    serialTab: { query: trimmed, notable, card, notFound },
    drawers,
    records,
  };
}
