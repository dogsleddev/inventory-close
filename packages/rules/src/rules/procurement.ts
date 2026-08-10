import type { ProcurementMatch } from "@icg/domain";
import type { RuleOutput } from "../engine/findings.js";
import type { Rule } from "../engine/rule.js";

/**
 * PROC-3WM-001 - PO / Item Receipt / Vendor Bill matching. The NATIVE
 * NetSuite match state and the CLOSE-control state are recorded separately
 * (CANONICAL_SPEC section 7): a native issue is not automatically an
 * accounting exception, and a native PASS can coexist with an open close
 * question. This rule emits match states only - cutoff escalation belongs
 * to CUT-IN-001.
 */
export const proc3wm001: Rule = {
  id: "PROC-3WM-001",
  version: "1.0.0",
  controlDomain: "PROCUREMENT",
  evaluate(ctx): RuleOutput {
    const matches: ProcurementMatch[] = [];
    for (const po of [...ctx.input.purchaseOrders].sort((a, b) =>
      a.transactionNumber < b.transactionNumber ? -1 : 1,
    )) {
      const receipt = ctx.input.itemReceipts.find(
        (r) => r.purchaseOrderNumber === po.transactionNumber,
      );
      const bill = ctx.input.vendorBills.find(
        (b) => b.purchaseOrderNumber === po.transactionNumber,
      );
      const receiptInPeriod = receipt !== undefined && receipt.receiptDate <= ctx.asOf;
      const billInPeriod = bill !== undefined && bill.billDate <= ctx.asOf;

      const quantitiesAgree =
        receipt !== undefined &&
        bill !== undefined &&
        po.lines.every((l) => {
          const rq = receipt.lines.find((x) => x.sku === l.sku)?.quantity ?? 0;
          const bq = bill.lines.find((x) => x.sku === l.sku)?.quantity ?? 0;
          return rq === l.quantity && bq === l.quantity;
        });

      // Native NetSuite view at the balance-sheet date.
      const native =
        receiptInPeriod && billInPeriod
          ? quantitiesAgree
            ? "PASS"
            : "REVIEW_REQUIRED"
          : "INCOMPLETE";

      // Close-control view: escalated only when period-end ownership/cutoff
      // is open - i.e. billed, unreceived at year end, title unresolved
      // (the CUT-IN-001 condition). A PO-specific rider governs.
      const rider = ctx.input.contracts.find((c) => c.title.includes(po.transactionNumber));
      const masterTitle = (ctx.index.contractsByCounterparty.get(po.vendor) ?? [])
        .filter((c) => !c.title.includes("Rider"))
        .flatMap((c) => c.provisions)
        .find((p) => p.provisionType === "OWNERSHIP_TRANSFER");
      const titlePresent = rider
        ? rider.provisions.some(
            (p) => p.provisionType === "OWNERSHIP_TRANSFER" && p.status === "PRESENT",
          )
        : masterTitle?.status === "PRESENT";
      const close =
        billInPeriod && !receiptInPeriod && !titlePresent ? "REVIEW_REQUIRED" : "PASS";

      matches.push({
        purchaseOrderNumber: po.transactionNumber,
        ...(receipt ? { itemReceiptNumber: receipt.transactionNumber } : {}),
        ...(bill ? { vendorBillNumber: bill.transactionNumber } : {}),
        nativeNetsuiteMatchStatus: native,
        closeMatchStatus: close,
      });
    }
    return {
      result: "PASS",
      coverage: "COMPLETE",
      findings: [],
      matches,
      notes: [
        "Native and close match states are separate; native three-way-match issues do not automatically create accounting exceptions.",
      ],
    };
  },
};
