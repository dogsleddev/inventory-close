import { buildChainCounts } from "@icg/domain";
import type { ChainComponent, TransactionChain } from "@icg/domain";
import type { RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/**
 * O2C-CHAIN-001 - commercial-chain completeness per sales order
 * (CANONICAL_SPEC section 8): Contract -> SO -> IF -> Carrier -> Delivery ->
 * Installation -> Telemetry -> Invoice -> Inventory/GL state. Component
 * coverage, never an accounting-confidence score; a chain can be 9/10
 * present and still blocked when a required component is missing.
 */
export const o2cChain001: Rule = {
  id: "O2C-CHAIN-001",
  version: "1.0.0",
  controlDomain: "COMMERCIAL_CHAIN",
  evaluate(ctx): RuleOutput {
    const chains: TransactionChain[] = [];
    for (const so of [...ctx.input.salesOrders].sort((a, b) =>
      a.transactionNumber < b.transactionNumber ? -1 : 1,
    )) {
      const iff = ctx.input.itemFulfillments.find(
        (f) => f.salesOrderNumber === so.transactionNumber,
      );
      const serials = (iff ?? so).lines.flatMap((l) => l.serials ?? []);
      const shipment = ctx.input.carrierShipments.find((c) =>
        iff
          ? c.itemFulfillmentNumber === iff.transactionNumber
          : c.serials.some((s) => serials.includes(s)),
      );
      const delivered = shipment?.events.find((e) => e.eventType === "DELIVERED");
      const installation = ctx.input.installations.find((i) =>
        i.serials.some((s) => serials.includes(s)),
      );
      const online = ctx.input.telemetry.find((t) => serials.includes(t.serial));
      const invoice = ctx.input.customerInvoices.find(
        (inv) => inv.salesOrderNumber === so.transactionNumber,
      );
      const contracts = ctx.index.contractsByCounterparty.get(so.customer) ?? [];
      const ownershipContract = contracts.find((c) =>
        c.provisions.some(
          (p) =>
            (p.provisionType === "OWNERSHIP_TRANSFER" || p.provisionType === "ACCEPTANCE") &&
            p.status === "PRESENT",
        ),
      );
      const stillOnBook = serials.filter((s) => ctx.index.unitsBySerial.has(s));
      const deployment = installation !== undefined || online !== undefined;

      const components: ChainComponent[] = [
        {
          name: "Contract (ownership/acceptance)",
          importance: "REQUIRED",
          state: ownershipContract ? "PRESENT" : "MISSING",
          ...(ownershipContract ? { reference: ownershipContract.id } : {}),
        },
        { name: "Sales Order", importance: "REQUIRED", state: "PRESENT", reference: so.transactionNumber },
        {
          name: "Item Fulfillment",
          importance: "REQUIRED",
          state: iff ? "PRESENT" : "MISSING",
          ...(iff ? { reference: iff.transactionNumber } : {}),
        },
        {
          name: "Carrier shipment",
          importance: "CORROBORATING",
          state: shipment ? "PRESENT" : "MISSING",
          ...(shipment ? { reference: shipment.id } : {}),
        },
        {
          name: "Delivery",
          importance: "REQUIRED",
          state: delivered ? "PRESENT" : "MISSING",
          ...(delivered ? { note: `delivered ${delivered.occurredAt.slice(0, 10)}` } : {}),
        },
        {
          name: "Installation",
          importance: "CORROBORATING",
          state: deployment ? (installation ? "PRESENT" : "MISSING") : "NOT_APPLICABLE",
          ...(installation ? { reference: installation.id } : {}),
        },
        {
          name: "Telemetry (first online)",
          importance: "CORROBORATING",
          state: deployment ? (online ? "PRESENT" : "MISSING") : "NOT_APPLICABLE",
        },
        {
          name: "Customer Invoice",
          importance: "CORROBORATING",
          state: invoice ? "PRESENT" : "MISSING",
          ...(invoice
            ? {
                reference: invoice.transactionNumber,
                note:
                  invoice.invoiceDate > ctx.asOf
                    ? `dated ${invoice.invoiceDate} (after period end); billing evidence only`
                    : "billing evidence only",
              }
            : {}),
        },
        {
          name: "Inventory relief",
          importance: "REQUIRED",
          state: iff ? (stillOnBook.length === 0 ? "PRESENT" : "MISSING") : "NOT_APPLICABLE",
          ...(stillOnBook.length > 0
            ? { note: `${stillOnBook.join(", ")} still on the year-end book` }
            : {}),
        },
      ];
      chains.push({
        subjectRef: so.transactionNumber,
        components,
        ...buildChainCounts(components),
      });
    }
    const anyRequiredMissing = chains.some((c) => c.requiredMissingCount > 0);
    return {
      result: anyRequiredMissing ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings: [],
      chains,
      notes: [
        "Chain completeness is component coverage, never an accounting-confidence score.",
      ],
    };
  },
};

/**
 * O2C-INV-001 - invoices are billing evidence only. Flags any period-open
 * chain where an invoice exists while ownership evidence or inventory
 * relief is missing, so no one treats billing as an ownership conclusion.
 */
export const o2cInv001: Rule = {
  id: "O2C-INV-001",
  version: "1.0.0",
  controlDomain: "COMMERCIAL_CHAIN",
  evaluate(ctx): RuleOutput {
    const notes: string[] = [];
    for (const invoice of ctx.input.customerInvoices) {
      if (invoice.salesOrderNumber === undefined) continue;
      const iff = ctx.input.itemFulfillments.find(
        (f) => f.salesOrderNumber === invoice.salesOrderNumber,
      );
      const serials = iff?.lines.flatMap((l) => l.serials ?? []) ?? [];
      const stillOnBook = serials.filter((s) => ctx.index.unitsBySerial.has(s));
      if (stillOnBook.length > 0) {
        notes.push(
          `${invoice.transactionNumber} bills ${invoice.salesOrderNumber} while ${stillOnBook.join(", ")} remain on the book - the invoice is billing evidence only and establishes neither ownership transfer nor inventory relief.`,
        );
      }
    }
    return {
      result: notes.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings: [],
      notes,
    };
  },
};
