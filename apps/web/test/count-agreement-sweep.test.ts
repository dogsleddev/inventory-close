import { afterEach, describe, expect, it } from "vitest";
import { EXPORT_TABLES, buildCsv } from "../lib/server/export-csv";
import { buildAdjustmentsData } from "../lib/server/adjustments-view";
import { buildAuditPackageData } from "../lib/server/audit-package-view";
import { buildCostingData } from "../lib/server/costing-view";
import { buildCustodyData } from "../lib/server/custody-view";
import { buildPhysicalCountData } from "../lib/server/count-view";
import { buildEvidenceData } from "../lib/server/evidence-view";
import {
  buildFinancialLifeData,
  buildInventorySearchData,
} from "../lib/server/financial-life-view";
import { buildInventoryListData } from "../lib/server/inventory-list-view";
import { buildCloseMemoData } from "../lib/server/memo-view";
import { buildMethodologyData } from "../lib/server/methodology-view";
import { buildProcurementData } from "../lib/server/procurement-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { buildValuationData } from "../lib/server/valuation-view";
import {
  buildExceptionDetailData,
  buildExceptionsData,
  buildOverviewData,
  buildShellData,
} from "../lib/server/data";
import { controller, resetDemo, resolveAllBut } from "./support/live-close";

/**
 * The count-varying-prose firewall, in the shape of `no-hardcoded-totals.ts`.
 *
 * This exists because of how the three instances it replaces were found: by
 * hand, in a browser, after concluding six blockers. `"1 blockers"` reached
 * the global header on all twenty routes, and the Overview gate said
 * "Unavailable — 1 blockers open" beside "1 blocker · $18,750". One of those
 * was opened by the very commit that made the figure live; the other two had
 * been shipping.
 *
 * Every one of them was INVISIBLE to the whole suite, and for a structural
 * reason: on a fresh workspace every population here is plural, so a
 * hard-coded plural is correct by construction. The defect only exists at a
 * count no test had ever built. So this file builds that state and renders
 * everything.
 *
 * It is a firewall, not a style check: a new screen is covered the moment it
 * is added to `PAYLOADS`, and a `plural()` call omitted anywhere in the app
 * fails here rather than in a demo.
 */

/**
 * "1 <word>s" — a count of one against a plural noun.
 *
 * The lookbehind is load-bearing and was written against a real false
 * positive: `/valuation` renders "19.1 months", where the "1" after the
 * decimal point sits at a word boundary and a naive `\b1 [a-z]+s\b` matches
 * it. Rejecting a preceding digit, dot, comma, hyphen or word character
 * leaves only a standalone 1.
 */
const PLURAL_AFTER_ONE = /(?<![\w.,-])1 ([a-z][a-z-]*s)\b/g;

/**
 * Words after which "1 <word>" is CORRECT English, in two groups.
 *
 * The pattern cannot tell a plural noun from a third-person-singular verb, and
 * both end in "s". "1 blockers" is the defect; "1 remains open" and "1 of
 * those blocks sign-off" are correct — the second of those is prose this pass
 * deliberately fixed INTO that shape, so a firewall that rejected it would be
 * demanding the defect back.
 *
 * Every entry below was flagged by a real run and read in context. Adding a
 * word here to silence a failure is the one way this file can be defeated, so
 * an entry that is neither a singular noun nor a verb is a defect in itself,
 * and a list that starts growing is a signal rather than maintenance.
 */
const CORRECT_AFTER_ONE = new Set([
  // Third-person-singular VERBS: the subject is the count, so "1 X <verb>s".
  "remains",
  "blocks",
  "has",
  "is",
  "was",
  "does",
  // Nouns that are singular despite the "s".
  "basis",
  "analysis",
  "business",
  "status",
  "series",
  "gross",
]);

/** Every payload a route renders, with the arguments its page supplies. */
function payloads(label: string): readonly { name: string; value: unknown }[] {
  const u = controller();
  const id = `${label}`;
  return [
    { name: "shell", value: buildShellData(u, id) },
    { name: "overview", value: buildOverviewData(u, id) },
    { name: "exceptions", value: buildExceptionsData(u, id) },
    { name: "exceptions?filter=blockers", value: buildExceptionsData(u, id, undefined, "blockers") },
    { name: "exceptions/EXC-001", value: buildExceptionDetailData(u, "EXC-001", id) },
    { name: "exceptions/EXC-015", value: buildExceptionDetailData(u, "EXC-015", id) },
    { name: "reconciliation", value: buildReconciliationData(u, "", id) },
    { name: "adjustments", value: buildAdjustmentsData(u, id) },
    { name: "evidence", value: buildEvidenceData(u, id) },
    { name: "physical-count", value: buildPhysicalCountData(u, id) },
    { name: "valuation", value: buildValuationData(u, id) },
    { name: "procurement", value: buildProcurementData(u, id) },
    { name: "costing", value: buildCostingData(u, id) },
    { name: "custody", value: buildCustodyData(u, id) },
    { name: "audit-package", value: buildAuditPackageData(u, "", id) },
    { name: "methodology", value: buildMethodologyData(u, id) },
    { name: "close-memo", value: buildCloseMemoData(u, id) },
    { name: "inventory", value: buildInventoryListData(u, {}, id) },
    { name: "inventory/KE-E2-1048", value: buildFinancialLifeData(u, "KE-E2-1048", id) },
    { name: "inventory/KE-X1-3498", value: buildFinancialLifeData(u, "KE-X1-3498", id) },
    { name: "inventory?q=KE-E2", value: buildInventorySearchData(u, "KE-E2", id) },
    ...EXPORT_TABLES.map((table) => ({
      name: `csv:${table}`,
      value: buildCsv(u, table, id),
    })),
  ];
}

/** Every "1 <plural>" in one payload, with enough context to read it. */
function offenders(name: string, value: unknown): readonly string[] {
  const text = JSON.stringify(value) ?? "";
  const found: string[] = [];
  for (const match of text.matchAll(PLURAL_AFTER_ONE)) {
    const word = match[1] as string;
    if (CORRECT_AFTER_ONE.has(word)) continue;
    const at = match.index ?? 0;
    found.push(`${name}: …${text.slice(Math.max(0, at - 55), at + 45)}…`);
  }
  return found;
}

describe("no count-varying prose disagrees with its own count of one", () => {
  afterEach(resetDemo);

  it("builds a meaningful surface", () => {
    // A guard against this file quietly covering nothing: if a builder is
    // renamed away the import fails, but if `payloads` is emptied it would
    // pass silently.
    expect(payloads("T-SWEEP-SANITY").length).toBeGreaterThan(20);
  });

  it("says '1 blocker' everywhere, at exactly one blocker", () => {
    resolveAllBut(1);
    const all = payloads("T-SWEEP-ONE").flatMap((p) => offenders(p.name, p.value));
    expect(all).toEqual([]);
  });

  /**
   * The second state, and not merely for completeness: resolving the LAST
   * blocker drops other populations to one as well — the reconciliation
   * bridge's "N exception(s) open" tail, the register's undrafted count, the
   * evidence gaps. Those are count-varying prose driven by a different
   * population, and this is the only state that renders them at one.
   */
  it("says '1 <noun>' everywhere, at zero blockers", () => {
    resolveAllBut(0);
    const all = payloads("T-SWEEP-ZERO").flatMap((p) => offenders(p.name, p.value));
    expect(all).toEqual([]);
  });

  /**
   * The firewall's own regression test. Without this, a broken regex — or a
   * lookbehind that rejects everything — makes the two tests above pass on
   * every possible payload, which is precisely the failure mode this repo has
   * measured. It also pins the "19.1 months" false positive that the
   * lookbehind exists to reject.
   */
  it("detects the defect it exists to detect, and not the false positive", () => {
    expect(offenders("probe", { note: "1 blockers open" })).toHaveLength(1);
    expect(offenders("probe", { note: "1 blocker remains" })).toEqual([]);
    expect(offenders("probe", { note: "19.1 months of supply" })).toEqual([]);
    expect(offenders("probe", { note: "$1,500 units" })).toEqual([]);
    expect(offenders("probe", { note: "on 1 basis" })).toEqual([]);
    expect(offenders("probe", { note: "7 blockers open" })).toEqual([]);
    // The verb case, which is correct and which this pass deliberately wrote.
    expect(offenders("probe", { note: "of which 1 remains open" })).toEqual([]);
    expect(offenders("probe", { note: "1 of those blocks sign-off" })).toEqual([]);
  });
});
