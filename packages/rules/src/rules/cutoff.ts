import type { ContractFixture } from "@icg/domain";
import type { RuleFinding, RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/**
 * Cutoff controls (CANONICAL_SPEC sections 7-8). Location is not ownership;
 * an invoice is billing evidence only - it does not itself establish
 * ownership transfer, inventory relief, acceptance, or revenue.
 */

function provisionStatus(
  contracts: readonly ContractFixture[],
  provisionType: string,
): "PRESENT" | "MISSING" | "ABSENT" {
  // Order-independent: located evidence in ANY governing document counts;
  // a MISSING marker in one contract never masks a PRESENT in another.
  let sawMissing = false;
  for (const c of contracts) {
    for (const p of c.provisions) {
      if (p.provisionType !== provisionType) continue;
      if (p.status === "PRESENT") return "PRESENT";
      sawMissing = true;
    }
  }
  return sawMissing ? "MISSING" : "ABSENT";
}

/** CUT-OUT-001 - outbound cutoff: shipped/deployed but still on the books. */
export const cutOut001: Rule = {
  id: "CUT-OUT-001",
  version: "1.0.0",
  controlDomain: "CUTOFF",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    let partial = false;

    for (const iff of ctx.input.itemFulfillments) {
      if (iff.shipDate > ctx.asOf) continue;
      const serials = iff.lines.flatMap((l) => l.serials ?? []);
      const stillOnBook = serials.filter((s) => ctx.index.unitsBySerial.has(s));
      if (stillOnBook.length === 0) continue; // relieved - clean cutoff

      const so = ctx.input.salesOrders.find(
        (s) => s.transactionNumber === iff.salesOrderNumber,
      );
      const shipment = ctx.input.carrierShipments.find(
        (c) => c.itemFulfillmentNumber === iff.transactionNumber,
      );
      if (!shipment) partial = true;
      const delivered = shipment?.events.find(
        (e) => e.eventType === "DELIVERED" && e.occurredAt.slice(0, 10) <= ctx.asOf,
      );
      const installation = ctx.input.installations.find((i) =>
        i.serials.some((s) => stillOnBook.includes(s)),
      );
      const online = ctx.input.telemetry.find(
        (t) => stillOnBook.includes(t.serial) && t.firstOnlineAt.slice(0, 10) <= ctx.asOf,
      );
      const invoice = ctx.input.customerInvoices.find(
        (inv) => inv.salesOrderNumber === iff.salesOrderNumber,
      );
      const customerContracts = so
        ? (ctx.index.contractsByCounterparty.get(so.customer) ?? [])
        : [];
      const ownership = provisionStatus(customerContracts, "OWNERSHIP_TRANSFER");
      const acceptance = provisionStatus(customerContracts, "ACCEPTANCE");
      const ownershipEvidenced = ownership === "PRESENT" || acceptance === "PRESENT";

      const exposure = stillOnBook.reduce(
        (sum, s) => sum + (ctx.index.unitsBySerial.get(s)?.unitCostCents ?? 0),
        0,
      );
      findings.push({
        ruleId: "CUT-OUT-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Outbound deployment / missing contract",
        whyFlagged: `${iff.transactionNumber} shipped ${iff.shipDate}${delivered ? `, delivered ${delivered.occurredAt.slice(0, 10)}` : ""}${installation ? `, installed ${installation.installedAt.slice(0, 10)}` : ""}${online ? `, first online ${online.firstOnlineAt.slice(0, 10)}` : ""}; NetSuite year-end inventory still shows ${stillOnBook.join(", ")} on hand, and the applicable ownership/acceptance contract provision ${ownershipEvidenced ? "requires review" : "cannot be located"}. The ${invoice ? `invoice ${invoice.transactionNumber} (dated ${invoice.invoiceDate})` : "absence of an invoice"} is billing evidence only and does not itself establish ownership, relief, acceptance, or revenue.`,
        reasonCodes: [
          "SHIPPED_NOT_RELIEVED",
          ...(ownershipEvidenced ? [] : ["OWNERSHIP_PROVISION_MISSING"]),
          "INVOICE_NOT_OWNERSHIP_EVIDENCE",
        ],
        assertions: ["CUTOFF", "RIGHTS_AND_OBLIGATIONS"],
        risk: "HIGH",
        exposureCents: exposure,
        subjects: {
          serials: stillOnBook,
          transactionNumbers: [
            iff.salesOrderNumber,
            iff.transactionNumber,
            ...(invoice ? [invoice.transactionNumber] : []),
          ],
        },
        initialStatus: ownershipEvidenced ? "ACCOUNTING_REVIEW" : "WAITING_ON_CONTRACT",
        evidenceRequirements: [
          { description: "Ownership/acceptance contract provision", required: true, satisfied: ownershipEvidenced },
          { description: "Carrier delivery confirmation", required: false, satisfied: delivered !== undefined, reference: shipment?.id },
          { description: "Installation record", required: false, satisfied: installation !== undefined, reference: installation?.id },
          { description: "Device telemetry (first online)", required: false, satisfied: online !== undefined },
        ],
      });
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: partial ? "PARTIAL" : "COMPLETE",
      findings,
    };
  },
};

/** CUT-IN-001 - inbound cutoff / goods in transit. */
export const cutIn001: Rule = {
  id: "CUT-IN-001",
  version: "1.0.0",
  controlDomain: "CUTOFF",
  evaluate(ctx): RuleOutput {
    const findings: RuleFinding[] = [];
    for (const bill of ctx.input.vendorBills) {
      if (bill.billDate > ctx.asOf || bill.purchaseOrderNumber === undefined) continue;
      const poNumber = bill.purchaseOrderNumber;
      const inPeriodReceipt = ctx.input.itemReceipts.find(
        (r) => r.purchaseOrderNumber === poNumber && r.receiptDate <= ctx.asOf,
      );
      if (inPeriodReceipt) continue; // received in period - no GIT question

      const serials = bill.lines.flatMap((l) => l.serials ?? []);
      const bookedInTransit =
        serials.some(
          (s) => ctx.index.unitsBySerial.get(s)?.location === "INBOUND_TRANSIT",
        ) ||
        ctx.input.inventoryUnits.some(
          (u) =>
            u.location === "INBOUND_TRANSIT" &&
            bill.lines.some((l) => l.sku === u.sku),
        );
      if (!bookedInTransit) continue;

      // A PO-specific title rider governs over the vendor master agreement.
      const rider = ctx.input.contracts.find((c) => c.title.includes(poNumber));
      const po = ctx.input.purchaseOrders.find(
        (p) => p.transactionNumber === poNumber,
      );
      const masterContracts = po
        ? (ctx.index.contractsByCounterparty.get(po.vendor) ?? []).filter(
            (c) => !c.title.includes("Rider"),
          )
        : [];
      const titleStatus = rider
        ? (rider.provisions.find((p) => p.provisionType === "OWNERSHIP_TRANSFER")?.status ?? "MISSING")
        : provisionStatus(masterContracts, "OWNERSHIP_TRANSFER");
      if (titleStatus === "PRESENT") continue; // title clear - proper GIT

      const lateReceipt = ctx.input.itemReceipts.find(
        (r) => r.purchaseOrderNumber === poNumber,
      );
      const shipment = ctx.input.carrierShipments.find(
        (c) => serials.length > 0 && c.serials.some((s) => serials.includes(s)),
      );
      const pickup = shipment?.events.find((e) => e.eventType === "PICKUP");
      const exposure = bill.lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0);
      findings.push({
        ruleId: "CUT-IN-001",
        ruleVersion: "1.0.0",
        kind: "ACCOUNTING_EXCEPTION",
        title: "Inbound GIT",
        whyFlagged: `Vendor bill ${bill.transactionNumber} (dated ${bill.billDate}) is recorded for ${poNumber}; the vendor shipped ${pickup ? pickup.occurredAt.slice(0, 10) : "before year end"} and the goods were in transit at ${ctx.asOf}, but the NetSuite item receipt ${lateReceipt ? `was not recorded until ${lateReceipt.receiptDate}` : "does not exist"} and the ownership terms are unresolved.`,
        reasonCodes: ["BILL_WITHOUT_PERIOD_RECEIPT", "TITLE_TERMS_UNRESOLVED"],
        assertions: ["CUTOFF", "RIGHTS_AND_OBLIGATIONS"],
        risk: "HIGH",
        exposureCents: exposure,
        subjects: {
          serials,
          transactionNumbers: [
            poNumber,
            bill.transactionNumber,
            ...(lateReceipt ? [lateReceipt.transactionNumber] : []),
          ],
          ...(rider ? { documentRefs: [rider.id] } : {}),
        },
        initialStatus: "ACCOUNTING_REVIEW",
        evidenceRequirements: [
          { description: "Ownership/title terms for the in-transit goods", required: true, satisfied: false },
          { description: "Vendor shipment evidence", required: false, satisfied: shipment !== undefined, reference: shipment?.id },
          { description: "Post-period item receipt", required: false, satisfied: lateReceipt !== undefined, reference: lateReceipt?.transactionNumber },
        ],
      });
    }
    return {
      result: findings.length > 0 ? "REVIEW_REQUIRED" : "PASS",
      coverage: "COMPLETE",
      findings,
    };
  },
};
