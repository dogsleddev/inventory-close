import type { CostComponentFixture, PeriodCostFixture } from "@icg/domain";
import { SKU_DEFS, VENDOR_OF } from "./constants.js";

/**
 * Standard-cost build-up and FY2026 period costs (dataset v1.2.0).
 *
 * Two halves of one question — *which costs belong in inventory?*
 *
 * `costComponents` is the capitalized half: the standard cost already inside
 * the $4,800,000 subledger, decomposed. Every SKU's components sum EXACTLY to
 * its `unitCostCents`; this module throws rather than emit a stack that does
 * not, because the whole value of a cost stack is that its total is the number
 * the rest of the close already uses.
 *
 * `periodCosts` is the expensed half: FY2026 pools deliberately kept out of
 * inventory, each carrying the basis for keeping it out. They are NOT GL
 * balances and must never be added to `glBalances` — `buildReconciliation`
 * sums every balance except 1290, so a period-cost row landing there would
 * silently move the locked gross GL.
 */

/** Cost-structure family, by SKU prefix. */
type CostFamily = "EDGE" | "VISION" | "ACCESSORY";

function familyOf(sku: string): CostFamily {
  if (sku.startsWith("KE-")) return "EDGE";
  if (sku.startsWith("KV-")) return "VISION";
  return "ACCESSORY";
}

/**
 * Conversion and landed-cost ratios in basis points. Direct material is not
 * listed: it is the remainder, so the stack closes to the cent for every SKU
 * regardless of how the other four round.
 */
const RATIOS_BPS: Readonly<
  Record<CostFamily, { labor: number; overhead: number; freight: number; duty: number }>
> = {
  // Contract-manufactured edge hardware: heaviest conversion content.
  EDGE: { labor: 1400, overhead: 1600, freight: 500, duty: 300 },
  // Imported cameras: bought largely finished, so landed cost dominates.
  VISION: { labor: 800, overhead: 1200, freight: 700, duty: 500 },
  ACCESSORY: { labor: 1000, overhead: 1300, freight: 500, duty: 200 },
};

const EFFECTIVE_FROM = "2026-01-01";

export function buildCostComponents(): CostComponentFixture[] {
  const rows: CostComponentFixture[] = [];
  for (const sku of SKU_DEFS) {
    const ratios = RATIOS_BPS[familyOf(sku.code)];
    const share = (bps: number): number => Math.round((sku.unitCostCents * bps) / 10_000);
    const labor = share(ratios.labor);
    const overhead = share(ratios.overhead);
    const freight = share(ratios.freight);
    const duty = share(ratios.duty);
    // The remainder, so the four rounded components can never leave a gap.
    const material = sku.unitCostCents - labor - overhead - freight - duty;
    const vendor = VENDOR_OF[sku.code];
    if (vendor === undefined) throw new Error(`No vendor for SKU ${sku.code}`);
    const stack: readonly { component: CostComponentFixture["component"]; amountCents: number; costSource: string }[] = [
      {
        component: "DIRECT_MATERIAL",
        amountCents: material,
        costSource: `${vendor} price list — FY2026 R2`,
      },
      {
        component: "DIRECT_LABOR",
        amountCents: labor,
        costSource: "Standard labor rate study — FY2026",
      },
      {
        component: "MANUFACTURING_OVERHEAD",
        amountCents: overhead,
        costSource: "Overhead absorption rate — FY2026 annual roll",
      },
      {
        component: "INBOUND_FREIGHT",
        amountCents: freight,
        costSource: "Inbound freight rate schedule — FY2026",
      },
      {
        component: "IMPORT_DUTY",
        amountCents: duty,
        costSource: "Customs duty schedule — FY2026",
      },
    ];
    const total = stack.reduce((sum, c) => sum + c.amountCents, 0);
    if (total !== sku.unitCostCents) {
      throw new Error(
        `Cost stack for ${sku.code} sums to ${total}, not ${sku.unitCostCents}`,
      );
    }
    if (material <= 0) {
      throw new Error(`Cost stack for ${sku.code} left no direct material`);
    }
    for (const c of stack) {
      rows.push({ sku: sku.code, ...c, effectiveFrom: EFFECTIVE_FROM });
    }
  }
  return rows;
}

/**
 * FY2026 costs taken to the period. Every row is EXPENSED_AS_INCURRED with
 * its basis: the capitalized side of the picture is the standard cost stack
 * above, not a row here.
 */
export function buildPeriodCosts(): PeriodCostFixture[] {
  return [
    {
      id: "PC-2026-0001",
      category: "Research and development",
      department: "Product Engineering",
      fiscalYear: "FY2026",
      amountCents: 184_500_000,
      treatment: "EXPENSED_AS_INCURRED",
      basis:
        "ASC 730-10-25-1 — research and development is expensed as incurred. It is not a cost of bringing inventory to its present location and condition.",
      glAccount: "6710",
    },
    {
      id: "PC-2026-0002",
      category: "Research and development",
      department: "Firmware and Cloud",
      fiscalYear: "FY2026",
      amountCents: 61_250_000,
      treatment: "EXPENSED_AS_INCURRED",
      basis:
        "ASC 730-10-25-1 — firmware developed for future product generations is research and development, not a conversion cost of units on hand.",
      glAccount: "6710",
    },
    {
      id: "PC-2026-0003",
      category: "Prototype materials",
      department: "Product Engineering",
      fiscalYear: "FY2026",
      amountCents: 18_430_000,
      treatment: "EXPENSED_AS_INCURRED",
      basis:
        "Materials consumed in development builds. The resulting units are not held for sale and never enter the inventory subledger.",
      glAccount: "6715",
    },
    {
      id: "PC-2026-0004",
      category: "Product qualification and test",
      department: "Quality Engineering",
      fiscalYear: "FY2026",
      amountCents: 26_800_000,
      treatment: "EXPENSED_AS_INCURRED",
      basis:
        "Qualification of shipped configurations occurs after production is complete, so it is a period cost rather than a cost of conversion.",
      glAccount: "6720",
    },
    {
      id: "PC-2026-0005",
      category: "Idle capacity and unabsorbed overhead",
      department: "Operations",
      fiscalYear: "FY2026",
      amountCents: 9_640_000,
      treatment: "EXPENSED_AS_INCURRED",
      basis:
        "ASC 330-10-30-3 — abnormal idle capacity is charged to the period. Only overhead absorbed at normal capacity is in the standard cost stack.",
      glAccount: "6730",
    },
    {
      id: "PC-2026-0006",
      category: "Freight on non-inventory shipments",
      department: "Operations",
      fiscalYear: "FY2026",
      amountCents: 2_380_000,
      treatment: "EXPENSED_AS_INCURRED",
      basis:
        "Freight on demonstration and service shipments. Inbound freight on purchased inventory is capitalized as the INBOUND_FREIGHT component of standard cost instead.",
      glAccount: "6735",
    },
  ];
}
