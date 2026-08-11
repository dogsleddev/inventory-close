import { describe, expect, it } from "vitest";
import { buildDataset, toCloseInput } from "../src/index.js";

/**
 * Dataset v1.2.0 additions (COMPLETION_PLAN Stage C, decisions D5 and D9).
 *
 * These pin the reasons the additions are SAFE, not the figures they happen
 * to contain. Five collections joined a locked dataset; each one could have
 * moved a control total, and each is prevented from doing so by a different
 * structural property. Those properties are what is tested here — a test
 * asserting "$4,800,000 is still $4,800,000" would pass right up until
 * somebody changed the constant, and would say nothing about why.
 */

const dataset = buildDataset();

describe("the standard cost stack closes to the locked unit cost", () => {
  it("sums each SKU's components exactly, with no rounding gap", () => {
    for (const sku of dataset.skus) {
      const components = dataset.costComponents.filter((c) => c.sku === sku.code);
      expect(components.length, sku.code).toBeGreaterThan(0);
      const total = components.reduce((sum, c) => sum + c.amountCents, 0);
      expect(total, `${sku.code} cost stack`).toBe(sku.unitCostCents);
    }
  });

  it("covers every SKU, so no unit is carried at a cost nothing explains", () => {
    const withStack = new Set(dataset.costComponents.map((c) => c.sku));
    for (const sku of dataset.skus) expect(withStack.has(sku.code), sku.code).toBe(true);
  });

  it("names the same vendor the purchase documents use", () => {
    // Two copies of "who supplies this part" is how a price list in the cost
    // stack starts citing a vendor no purchase order ever used.
    const poVendors = new Map<string, Set<string>>();
    for (const po of dataset.purchaseOrders) {
      for (const line of po.lines) {
        const set = poVendors.get(line.sku) ?? new Set<string>();
        set.add(po.vendor);
        poVendors.set(line.sku, set);
      }
    }
    for (const row of dataset.costComponents) {
      if (row.component !== "DIRECT_MATERIAL") continue;
      const vendors = poVendors.get(row.sku);
      if (vendors === undefined) continue;
      const named = [...vendors].some((v) => row.costSource.startsWith(v));
      expect(named, `${row.sku}: ${row.costSource}`).toBe(true);
    }
  });
});

describe("period costs stay out of inventory", () => {
  it("puts no period cost in glBalances", () => {
    const balanceAccounts = new Set(dataset.glBalances.map((b) => b.account));
    for (const cost of dataset.periodCosts) {
      // `buildReconciliation` sums every GL balance except 1290, so a period
      // cost landing in that collection would move the locked gross GL
      // without a single line of rule code changing.
      expect(balanceAccounts.has(cost.glAccount), cost.id).toBe(false);
    }
  });

  it("carries an expense account, never an inventory one", () => {
    const inventoryAccounts = new Set(["1200", "1210", "1220", "1230", "1290"]);
    for (const cost of dataset.periodCosts) {
      expect(inventoryAccounts.has(cost.glAccount), cost.id).toBe(false);
    }
  });

  it("states a basis for every pool, because the boundary is the point", () => {
    for (const cost of dataset.periodCosts) {
      expect(cost.treatment).toBe("EXPENSED_AS_INCURRED");
      expect(cost.basis.length, cost.id).toBeGreaterThan(20);
    }
  });
});

describe("off-book units are off the book by construction", () => {
  const booked = new Set(dataset.inventoryUnits.map((u) => u.serial));

  it("keeps every consigned serial out of the book population", () => {
    expect(dataset.consignmentInUnits.length).toBeGreaterThan(0);
    for (const unit of dataset.consignmentInUnits) {
      expect(booked.has(unit.serial), unit.serial).toBe(false);
    }
  });

  it("keeps every disposed serial out of the book population", () => {
    expect(dataset.dispositions.length).toBeGreaterThan(0);
    for (const d of dataset.dispositions) {
      expect(booked.has(d.serial), d.serial).toBe(false);
    }
  });

  it("mints them from the same registry, so no serial is used twice", () => {
    const offBook = [
      ...dataset.consignmentInUnits.map((u) => u.serial),
      ...dataset.dispositions.map((d) => d.serial),
    ];
    expect(new Set(offBook).size).toBe(offBook.length);
  });

  it("never attributes a consigned unit to the company", () => {
    for (const unit of dataset.consignmentInUnits) {
      expect(unit.owner).not.toMatch(/KestrelGrid/i);
      // The value is the owner's, and the field says so — the company has no
      // cost basis in a unit it never bought.
      expect(unit.vendorStatedValueCents).toBeGreaterThan(0);
    }
  });

  it("disposes each unit before the balance-sheet date", () => {
    for (const d of dataset.dispositions) {
      expect(d.disposedAt < dataset.manifest.balanceSheetDate, d.id).toBe(true);
      expect(d.sourceRef.transactionNumber, d.id).toBeDefined();
      if (d.method === "SCRAPPED") expect(d.proceedsCents, d.id).toBe(0);
    }
  });
});

describe("purchase price variance sits on the bill and nowhere else", () => {
  const varied = dataset.vendorBills.filter((bill) => {
    const po = dataset.purchaseOrders.find(
      (p) => p.transactionNumber === bill.purchaseOrderNumber,
    );
    if (po === undefined) return false;
    return bill.lines.some((bl) => {
      const pl = po.lines.find((l) => l.lineId === bl.lineId);
      return pl !== undefined && pl.amountCents !== bl.amountCents;
    });
  });

  it("seeds a variance on at least one bill per vendor that has one", () => {
    expect(varied.length).toBeGreaterThan(0);
    const vendors = new Set(
      varied.map(
        (b) =>
          dataset.purchaseOrders.find((p) => p.transactionNumber === b.purchaseOrderNumber)
            ?.vendor,
      ),
    );
    expect(vendors.size).toBeGreaterThan(1);
  });

  it("leaves the order and the receipt at the price that was ordered", () => {
    // The generator builds ONE lines array and hands it to the purchase
    // order, the receipt and the bill. Repricing it in place would reprice
    // all three, and a three-way match where every leg moved together is not
    // a price variance — it is a corrupted fixture.
    for (const bill of varied) {
      const po = dataset.purchaseOrders.find(
        (p) => p.transactionNumber === bill.purchaseOrderNumber,
      );
      const receipt = dataset.itemReceipts.find(
        (r) => r.purchaseOrderNumber === bill.purchaseOrderNumber,
      );
      expect(po, bill.transactionNumber).toBeDefined();
      expect(receipt, bill.transactionNumber).toBeDefined();
      for (const line of po?.lines ?? []) {
        const rl = receipt?.lines.find((l) => l.lineId === line.lineId);
        expect(rl?.amountCents, `${bill.transactionNumber} ${line.lineId}`).toBe(
          line.amountCents,
        );
      }
    }
  });

  it("changes no quantity, so the native three-way match is untouched", () => {
    for (const bill of varied) {
      const po = dataset.purchaseOrders.find(
        (p) => p.transactionNumber === bill.purchaseOrderNumber,
      );
      for (const bl of bill.lines) {
        const pl = po?.lines.find((l) => l.lineId === bl.lineId);
        expect(pl?.quantity, `${bill.transactionNumber} ${bl.lineId}`).toBe(bl.quantity);
      }
    }
  });

  it("varies only fully matched in-period orders", () => {
    const asOf = dataset.manifest.balanceSheetDate;
    for (const bill of varied) {
      const receipt = dataset.itemReceipts.find(
        (r) => r.purchaseOrderNumber === bill.purchaseOrderNumber,
      );
      expect(bill.billDate <= asOf, bill.transactionNumber).toBe(true);
      expect((receipt?.receiptDate ?? "9999") <= asOf, bill.transactionNumber).toBe(true);
    }
  });
});

describe("the additions cannot reach the rule engine", () => {
  it("keeps every new collection out of the close input", () => {
    // `toCloseInput` is an explicit allowlist, and that is the whole defence:
    // a collection the rules never see cannot move an exception, a blocker,
    // a readiness input or an output hash.
    const input = toCloseInput(dataset) as Record<string, unknown>;
    for (const name of [
      "costComponents",
      "periodCosts",
      "consignmentInUnits",
      "dispositions",
    ]) {
      expect(Object.keys(input), name).not.toContain(name);
    }
  });

  it("leaves every locked control total where it was", () => {
    const totals = dataset.manifest.controlTotals;
    expect(totals.bookUnits).toBe(1500);
    expect(totals.grossInventoryCents).toBe(480_000_000);
    expect(totals.grossGlCents).toBe(481_245_000);
    expect(totals.grossGlDifferenceCents).toBe(1_245_000);
    expect(totals.reserveCents).toBe(-5_400_000);
    expect(totals.countPopulationUnits).toBe(1065);
    expect(totals.sourceHealthBasisPoints).toBe(9167);
  });

  it("counts the new collections in the manifest, so the bump is visible", () => {
    const counts = dataset.manifest.rowCounts;
    expect(counts["costComponents"]).toBe(dataset.costComponents.length);
    expect(counts["periodCosts"]).toBe(dataset.periodCosts.length);
    expect(counts["consignmentInUnits"]).toBe(dataset.consignmentInUnits.length);
    expect(counts["dispositions"]).toBe(dataset.dispositions.length);
    expect(dataset.manifest.datasetVersion).toBe("FY2026-DEMO-v1.2.0");
  });
});
