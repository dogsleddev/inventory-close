import type { DemoUser } from "@icg/data";
import type { TransactionChain } from "@icg/domain";
import type { ExceptionView, ProcurementDetail } from "@icg/services";
import { formatCents, formatDate, formatDateShort } from "../format";
import type {
  ChainNodeView,
  EvidenceRecordView,
  ExceptionDrawerData,
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
import { locationLabel, titleCase } from "./humanize";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * Reconciliation — stage 06 owns the Procurement Match, Commercial Chain,
 * and Serial Integrity tabs (the financial bridge is stage 07). The native
 * NetSuite match state and the close-control state are separate columns
 * everywhere; neither is ever derived from the other here.
 */

function totalAmountCents(
  lines: readonly { amountCents?: number | undefined }[] | undefined,
): number | undefined {
  if (lines === undefined) return undefined;
  let total = 0;
  for (const l of lines) {
    if (l.amountCents === undefined) return undefined;
    total += l.amountCents;
  }
  return total;
}

function closeCapsule(status: string): {
  label: string;
  glyph: string;
  variant: "frost" | "aurora";
} {
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
  const manifest = attempt(() => queries.getRunManifest(ctx));
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
      d = attempt(() => queries.getProcurementDetail(ctx, po)) ?? {};
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
    const amount = totalAmountCents(po.lines);
    const qty = po.lines.reduce((n, l) => n + l.quantity, 0);
    const skus = [...new Set(po.lines.map((l) => l.sku))].join(", ");
    return {
      label: "PURCHASE ORDER",
      glyph: "✓",
      value: `${po.transactionNumber} · ${formatDateShort(po.orderDate)}`,
      note: `${po.vendor} · ${qty} × ${skus}${amount !== undefined ? ` · ${formatCents(amount)}` : ""}`,
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
    const amount = totalAmountCents(vb.lines);
    return {
      label: "VENDOR BILL",
      glyph: "✓",
      value: `${vb.transactionNumber} · ${formatDateShort(vb.billDate)}`,
      note: `Received and recorded${amount !== undefined ? ` · ${formatCents(amount)}` : ""}`,
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
    const qty = po?.lines.reduce((n, l) => n + l.quantity, 0);
    const skus = po !== undefined ? [...new Set(po.lines.map((l) => l.sku))].join(", ") : "";
    const amount = totalAmountCents(po?.lines);
    const f = view?.exception.finding;
    return {
      key: poNumber,
      po: poNumber,
      title,
      qtyAmount:
        qty !== undefined
          ? `${qty} × ${skus}${amount !== undefined ? ` · ${formatCents(amount)}` : ""}`
          : null,
      nsTag: `NS 3WM · ${match?.nativeNetsuiteMatchStatus ?? "—"}`,
      close:
        view !== undefined && view.open
          ? { label: statusView(view.exception.status).label, glyph: "◆", variant: "frost" }
          : closeCapsule(match?.closeMatchStatus ?? "PASS"),
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
      amount: totalAmountCents(detailFor(m.purchaseOrderNumber).purchaseOrder?.lines) ?? 0,
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

  const procurementRows = matches.map((m) => ({
    po: m.purchaseOrderNumber,
    ir: m.itemReceiptNumber ?? "—",
    vb: m.vendorBillNumber ?? "—",
    native: `NS 3WM · ${m.nativeNetsuiteMatchStatus}`,
    close: closeCapsule(m.closeMatchStatus),
    exceptionId:
      m.closeMatchStatus !== "PASS"
        ? drawerFor(byTransaction(m.purchaseOrderNumber, m.itemReceiptNumber, m.vendorBillNumber))
        : null,
  }));

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
      const yeRow = life.inventoryLife.countRows.find((r) => r.countType === "YEAR_END");
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
        sku: life.unit?.sku ?? "—",
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
                  : yeRow !== undefined && yeRow.variance === 0
                    ? locationLabel(yeRow.location)
                    : "No operational events",
            sub:
              deployed !== undefined
                ? `Installed${life.sellSide.firstOnlineAt !== undefined ? " and online" : ""} ${formatDateShort(deployed)}`
                : observation !== undefined
                  ? observation.observation
                  : yeRow !== undefined
                    ? "Matched in the year-end count"
                    : "Nothing places this unit elsewhere",
            ember: deployed !== undefined && life.unit !== undefined,
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
              yeRow !== undefined
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
