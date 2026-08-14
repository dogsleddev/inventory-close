import type { DemoUser } from "@icg/data";
import type { PhysicalCustodyType } from "@icg/domain";
import { formatCents, formatDate, plural } from "../format";
import type { StatusView } from "../workflow-view";
import { classificationLabel, locationLabel } from "./humanize";
import { getQueries, makeContext, roleLabel } from "./workspace";

/**
 * All-Inventory master list (COMPLETION_PLAN §4).
 *
 * The Inventory page used to answer one question — "where is this serial?"
 * — and could not answer the first question on the brief's list: *what do
 * we have*. This builder turns the same `close.read` population into a flat
 * master list: one row per book unit, every column derived from state the
 * close already holds, filtered server-side from the query string.
 *
 * Four rules this file exists to keep:
 *
 * 1. **Nothing is invented.** Every column comes from `listInventoryMaster`,
 *    which derives from the unit listing, the count results, the exception
 *    findings and the valuation workspace. No fixture was added for this
 *    view and no figure is computed here that a service did not produce.
 * 2. **Age agrees with Valuation.** The bucket keys and labels are the
 *    valuation workspace's own, so the aging on this page and the aging on
 *    the Valuation page cannot disagree about a unit.
 * 3. **A population is not a unit.** An exception whose subjects are a SKU
 *    or a SKU-and-location names a POPULATION. CNT-VAR-001 flags an
 *    accessory bin, not the accessories in it — so those rows carry a chip
 *    that says the finding names the SKU or the bin, and their status stays
 *    "no exception names this unit". Only a finding carrying this unit's
 *    serial, or the custodian recorded as holding it, names the unit.
 * 4. **Every row is on the year-end listing.** This view renders the book
 *    population and nothing else; it never implies membership for anything
 *    outside it. Off-book observations stay where they already are — in the
 *    serial search above the table, which reaches beyond the listing.
 */

/** Rows per page. The population is the whole book; the browser gets 100. */
export const INVENTORY_PAGE_SIZE = 100;

export interface InventoryFilterOption {
  readonly value: string;
  readonly label: string;
  /** Rows in the whole population matching this option — never a guess. */
  readonly count: number | null;
}

export interface InventoryFilterField {
  /** Query-string parameter name. */
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly InventoryFilterOption[];
}

export interface InventoryExceptionChip {
  readonly id: string;
  readonly href: string;
  /** True only when the finding carries this unit's serial or custodian. */
  readonly namesUnit: boolean;
  /** Says exactly what the finding named — never "this unit" when it did not. */
  readonly basisNote: string;
}

export interface InventoryCountCell {
  readonly when: string;
  readonly what: string;
  readonly variance: string | null;
}

export interface InventoryMasterRowView {
  readonly serial: string;
  readonly href: string;
  readonly sku: string;
  readonly product: string;
  /** Set only where the SKU is not serialized (a minted book id, not a serial). */
  readonly trackingNote: string | null;
  readonly quantity: string;
  readonly location: string;
  readonly custody: string;
  readonly custodian: string | null;
  readonly classification: string;
  readonly ownership: string;
  readonly ownershipUnderReview: boolean;
  readonly unitCost: string;
  readonly carrying: string;
  readonly glAccount: string;
  /** Null when no count line covers the unit — absence, never a zero. */
  readonly lastCount: InventoryCountCell | null;
  readonly age: string;
  readonly ageBand: string;
  readonly exceptions: readonly InventoryExceptionChip[];
  readonly status: StatusView;
}

export interface InventoryPaging {
  readonly page: number;
  readonly pageCount: number;
  readonly rangeNote: string;
  readonly prevHref: string | null;
  readonly nextHref: string | null;
}

export interface InventoryMasterData {
  readonly restricted: boolean;
  readonly roleLabel: string;
  /** Population line for the page head: units and carrying value on the book. */
  readonly populationNote: string;
  readonly asOfNote: string;
  readonly serialQuery: string;
  readonly filters: readonly InventoryFilterField[];
  readonly activeFilterCount: number;
  readonly clearHref: string;
  /** Result line for the panel head — the filter's counts, not the close's. */
  readonly resultNote: string;
  readonly resultCarrying: string;
  readonly emptyNote: string | null;
  readonly rows: readonly InventoryMasterRowView[];
  readonly paging: InventoryPaging;
  /** Column-level honesty notes rendered under the table. */
  readonly notes: readonly string[];
}

/** Query-string parameters this view reads. Everything else is ignored. */
export interface InventoryListParams {
  readonly q?: string | undefined;
  readonly sku?: string | undefined;
  readonly loc?: string | undefined;
  readonly custody?: string | undefined;
  readonly cls?: string | undefined;
  readonly gl?: string | undefined;
  readonly own?: string | undefined;
  readonly count?: string | undefined;
  readonly age?: string | undefined;
  readonly exc?: string | undefined;
  readonly page?: string | undefined;
}

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error && error.name === "AuthorizationError") return undefined;
    throw error;
  }
}

/**
 * Custody display copy. The canonical values live in @icg/domain; the
 * words a Controller reads live here, beside every other label map.
 *
 * Exported so the Custody & Disposition screen reads the same words. Two
 * copies of this map is how one screen calls a unit "Third-party custodian"
 * and another calls the same unit something else.
 */
export const CUSTODY_LABELS: Readonly<Record<PhysicalCustodyType, string>> = {
  COMPANY_WAREHOUSE: "Company warehouse",
  IN_TRANSIT_INBOUND: "In transit — inbound",
  IN_TRANSIT_OUTBOUND: "In transit — outbound",
  FIELD_DEMO_LOANER: "Field demo / loaner",
  CUSTOMER_SITE: "Customer site",
  THIRD_PARTY_CUSTODIAN: "Third-party custodian",
  CONTRACT_MANUFACTURER: "Contract manufacturer",
  REPAIR_RMA_HOLD: "Repair / RMA hold",
  QUARANTINE_DAMAGED: "Quarantine — damaged",
  CONSIGNMENT_IN: "Consignment in (vendor-owned)",
  CONSIGNMENT_OUT: "Consignment out",
  UNDETERMINED: "Not established",
};

const COUNT_TYPE_LABELS: Readonly<Record<string, string>> = {
  YEAR_END: "Year-end count",
  CYCLE: "Cycle count",
  SPOT: "Spot count",
};

const COUNT_FILTER_LABELS: Readonly<Record<string, string>> = {
  unit: "Named on a count sheet",
  sku: "Counted at SKU / bin level",
  none: "No count line covers it",
  variance: "Count line carries a variance",
};

const EXCEPTION_FILTER_LABELS: Readonly<Record<string, string>> = {
  named: "An exception names this unit",
  open: "Named in an open exception",
  blocker: "Named in a sign-off blocker",
  population: "Its SKU or bin is named (unit is not)",
  none: "No exception reaches it",
};

const OWNERSHIP_LABELS: Readonly<Record<string, string>> = {
  COMPANY_OWNED: "Company-owned (recorded)",
  UNDER_REVIEW: "Rights under review",
};

/** The four statuses a row can hold. All four are about NAMING, not blame. */
const ROW_STATUS: Readonly<Record<string, StatusView>> = {
  BLOCKER: { label: "Blocking sign-off", glyph: "◆", variant: "review" },
  OPEN: { label: "Open exception", glyph: "◆", variant: "waiting" },
  RESOLVED: { label: "Resolved", glyph: "✓", variant: "resolved" },
  NONE: { label: "None named", glyph: "○", variant: "neutral" },
};

const num = (n: number) => n.toLocaleString("en-US");

function hrefFor(
  params: InventoryListParams,
  overrides: Partial<Record<keyof InventoryListParams, string | undefined>>,
): string {
  const merged: Record<string, string | undefined> = { ...params, ...overrides };
  const search = new URLSearchParams();
  for (const key of ["q", "sku", "loc", "custody", "cls", "gl", "own", "count", "age", "exc", "page"]) {
    const value = merged[key];
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const query = search.toString();
  return query === "" ? "/inventory" : `/inventory?${query}`;
}

export function buildInventoryListData(
  user: DemoUser,
  params: InventoryListParams,
  correlationId: string,
): InventoryMasterData {
  const queries = getQueries();
  const ctx = makeContext(user, correlationId);
  const master = attempt(() => queries.listInventoryMaster(ctx));

  const empty: InventoryMasterData = {
    restricted: true,
    roleLabel: roleLabel(user),
    populationNote: "",
    asOfNote: "",
    serialQuery: (params.q ?? "").trim(),
    filters: [],
    activeFilterCount: 0,
    clearHref: "/inventory",
    resultNote: "",
    resultCarrying: "",
    emptyNote: null,
    rows: [],
    paging: { page: 1, pageCount: 1, rangeNote: "", prevHref: null, nextHref: null },
    notes: [],
  };
  if (master === undefined) return empty;

  const all = master.rows;
  const serialQuery = (params.q ?? "").trim();
  const needle = serialQuery.toUpperCase();

  // Every predicate is a pure read of a derived row field. Filtering happens
  // on the server so the whole-book population never has to reach the browser.
  const namesUnit = (row: (typeof all)[number]) =>
    row.exceptions.filter((e) => e.identifiesUnit);
  const matches = (row: (typeof all)[number]): boolean => {
    if (needle !== "" && !row.serial.toUpperCase().includes(needle)) return false;
    if (params.sku !== undefined && params.sku !== "" && row.sku !== params.sku) return false;
    if (params.loc !== undefined && params.loc !== "" && row.location !== params.loc) return false;
    if (
      params.custody !== undefined &&
      params.custody !== "" &&
      row.custodyType !== params.custody
    ) {
      return false;
    }
    if (params.cls !== undefined && params.cls !== "" && row.classification !== params.cls) {
      return false;
    }
    if (params.gl !== undefined && params.gl !== "" && row.glAccount !== params.gl) return false;
    if (params.own !== undefined && params.own !== "" && row.ownership !== params.own) return false;
    if (params.age !== undefined && params.age !== "") {
      const band = params.age === "UNKNOWN" ? undefined : params.age;
      if ((row.ageBandKey ?? undefined) !== band) return false;
    }
    if (params.count !== undefined && params.count !== "") {
      const c = row.lastCount;
      if (params.count === "unit" && c?.basis !== "UNIT") return false;
      if (params.count === "sku" && c?.basis !== "SKU_LOCATION") return false;
      if (params.count === "none" && c !== undefined) return false;
      if (params.count === "variance" && (c === undefined || c.variance === 0)) return false;
    }
    if (params.exc !== undefined && params.exc !== "") {
      const named = namesUnit(row);
      if (params.exc === "named" && named.length === 0) return false;
      if (params.exc === "open" && !named.some((e) => e.open)) return false;
      if (params.exc === "blocker" && !named.some((e) => e.blocker && e.open)) return false;
      if (params.exc === "population" && (named.length > 0 || row.exceptions.length === 0)) {
        return false;
      }
      if (params.exc === "none" && row.exceptions.length > 0) return false;
    }
    return true;
  };

  const filtered = all.filter(matches);
  const filteredCarrying = filtered.reduce((sum, r) => sum + r.carryingCents, 0);
  const bookCarrying = all.reduce((sum, r) => sum + r.carryingCents, 0);

  // Option counts are over the WHOLE population, so a select never reports a
  // filter as empty because a different filter is narrowing it.
  const tally = <T extends string>(key: (row: (typeof all)[number]) => T | undefined) => {
    const out = new Map<T, number>();
    for (const row of all) {
      const k = key(row);
      if (k === undefined) continue;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  };
  const option = (value: string, label: string, count: number | null): InventoryFilterOption => ({
    value,
    label,
    count,
  });
  const sortedOptions = (
    counts: Map<string, number>,
    label: (value: string) => string,
  ): InventoryFilterOption[] =>
    [...counts.entries()]
      .map(([value, count]) => option(value, label(value), count))
      .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  const countBasis = tally((r) =>
    r.lastCount === undefined ? "none" : r.lastCount.basis === "UNIT" ? "unit" : "sku",
  );
  const varianceRows = all.filter(
    (r) => r.lastCount !== undefined && r.lastCount.variance !== 0,
  ).length;
  const namedRows = all.filter((r) => namesUnit(r).length > 0);
  const filters: InventoryFilterField[] = [
    {
      name: "sku",
      label: "SKU",
      value: params.sku ?? "",
      options: sortedOptions(tally((r) => r.sku), (v) => v),
    },
    {
      name: "loc",
      label: "Location",
      value: params.loc ?? "",
      options: sortedOptions(tally((r) => r.location), locationLabel),
    },
    {
      name: "custody",
      label: "Custody",
      value: params.custody ?? "",
      options: sortedOptions(
        tally((r) => r.custodyType as string),
        (v) => CUSTODY_LABELS[v as PhysicalCustodyType] ?? v,
      ),
    },
    {
      name: "cls",
      label: "Classification",
      value: params.cls ?? "",
      options: sortedOptions(tally((r) => r.classification), classificationLabel),
    },
    {
      name: "gl",
      label: "GL account",
      value: params.gl ?? "",
      options: [...tally((r) => r.glAccount).entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([value, count]) => option(value, value, count)),
    },
    {
      name: "own",
      label: "Ownership",
      value: params.own ?? "",
      options: [...tally((r) => r.ownership as string).entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([value, count]) => option(value, OWNERSHIP_LABELS[value] ?? value, count)),
    },
    {
      name: "count",
      label: "Count status",
      value: params.count ?? "",
      options: [
        option("unit", COUNT_FILTER_LABELS["unit"] ?? "", countBasis.get("unit") ?? 0),
        option("sku", COUNT_FILTER_LABELS["sku"] ?? "", countBasis.get("sku") ?? 0),
        option("none", COUNT_FILTER_LABELS["none"] ?? "", countBasis.get("none") ?? 0),
        option("variance", COUNT_FILTER_LABELS["variance"] ?? "", varianceRows),
      ],
    },
    {
      name: "age",
      label: "Age band",
      value: params.age ?? "",
      options: [
        ...master.ageBands.map((b) =>
          option(b.key, b.label, all.filter((r) => r.ageBandKey === b.key).length),
        ),
        option(
          "UNKNOWN",
          "Age not established",
          all.filter((r) => r.ageBandKey === undefined).length,
        ),
      ],
    },
    {
      name: "exc",
      label: "Exception",
      value: params.exc ?? "",
      options: [
        option("named", EXCEPTION_FILTER_LABELS["named"] ?? "", namedRows.length),
        option(
          "open",
          EXCEPTION_FILTER_LABELS["open"] ?? "",
          namedRows.filter((r) => namesUnit(r).some((e) => e.open)).length,
        ),
        option(
          "blocker",
          EXCEPTION_FILTER_LABELS["blocker"] ?? "",
          namedRows.filter((r) => namesUnit(r).some((e) => e.blocker && e.open)).length,
        ),
        option(
          "population",
          EXCEPTION_FILTER_LABELS["population"] ?? "",
          all.filter((r) => r.exceptions.length > 0 && namesUnit(r).length === 0).length,
        ),
        option(
          "none",
          EXCEPTION_FILTER_LABELS["none"] ?? "",
          all.filter((r) => r.exceptions.length === 0).length,
        ),
      ],
    },
  ];

  const activeFilterCount =
    filters.filter((f) => f.value !== "").length + (serialQuery === "" ? 0 : 1);

  const pageCount = Math.max(1, Math.ceil(filtered.length / INVENTORY_PAGE_SIZE));
  const requested = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;
  const start = (page - 1) * INVENTORY_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + INVENTORY_PAGE_SIZE);

  const rows: InventoryMasterRowView[] = pageRows.map((row) => {
    const named = row.exceptions.filter((e) => e.identifiesUnit);
    const statusKey =
      named.some((e) => e.open && e.blocker)
        ? "BLOCKER"
        : named.some((e) => e.open)
          ? "OPEN"
          : named.length > 0
            ? "RESOLVED"
            : "NONE";
    const count = row.lastCount;
    return {
      serial: row.serial,
      href: `/inventory/${row.serial}`,
      sku: row.sku,
      product: row.product,
      trackingNote: row.serialized ? null : "Batch-tracked SKU · book unit id",
      quantity: String(row.quantity),
      location: locationLabel(row.location),
      custody: CUSTODY_LABELS[row.custodyType] ?? row.custodyType,
      custodian: row.custodian ?? null,
      classification: classificationLabel(row.classification),
      ownership: OWNERSHIP_LABELS[row.ownership] ?? row.ownership,
      ownershipUnderReview: row.ownership === "UNDER_REVIEW",
      unitCost: formatCents(row.unitCostCents),
      carrying: formatCents(row.carryingCents),
      glAccount: row.glAccount,
      lastCount:
        count === undefined
          ? null
          : {
              when: formatDate(count.countedAt),
              what: COUNT_TYPE_LABELS[count.countType] ?? count.countType,
              variance:
                count.basis === "SKU_LOCATION"
                  ? count.variance === 0
                    ? "SKU / bin line — unit not named"
                    : `SKU / bin line — variance ${count.variance > 0 ? "+" : ""}${count.variance}`
                  : count.variance === 0
                    ? null
                    : `Variance ${count.variance > 0 ? "+" : ""}${count.variance}`,
            },
      age: row.ageDays === undefined ? "Not established" : `${num(row.ageDays)} days`,
      ageBand:
        row.ageBandKey === undefined
          ? "No movement date on file"
          : (master.ageBands.find((b) => b.key === row.ageBandKey)?.label ?? row.ageBandKey),
      exceptions: row.exceptions.map((e) => ({
        id: e.exceptionId,
        href: `/exceptions/${e.exceptionId}`,
        namesUnit: e.identifiesUnit,
        basisNote:
          e.basis === "SERIAL"
            ? `${e.exceptionId} names this serial`
            : e.basis === "CUSTODIAN"
              ? `${e.exceptionId} names the custodian recorded as holding this unit`
              : e.basis === "SKU_AND_LOCATION"
                ? `${e.exceptionId} names this SKU at this location — not this unit`
                : `${e.exceptionId} names this SKU — not this unit`,
      })),
      status: ROW_STATUS[statusKey] ?? ROW_STATUS["NONE"]!,
    };
  });

  const rangeFrom = filtered.length === 0 ? 0 : start + 1;
  const rangeTo = start + pageRows.length;

  return {
    restricted: false,
    roleLabel: roleLabel(user),
    populationNote: `${num(master.bookUnits)} ${plural(master.bookUnits, "unit", "units")} on the year-end listing · ${formatCents(bookCarrying)} carrying value`,
    asOfNote: `Balance-sheet date ${formatDate(master.asOf)}`,
    serialQuery,
    filters,
    activeFilterCount,
    clearHref: "/inventory",
    resultNote:
      activeFilterCount === 0
        ? `All ${num(filtered.length)} ${plural(filtered.length, "unit", "units")}`
        : `${num(filtered.length)} of ${num(master.bookUnits)} ${plural(master.bookUnits, "unit", "units")} match`,
    resultCarrying: formatCents(filteredCarrying),
    emptyNote:
      filtered.length > 0
        ? null
        : "No unit on the year-end listing matches these filters — verified empty, not assumed.",
    rows,
    paging: {
      page,
      pageCount,
      rangeNote:
        filtered.length === 0
          ? "No rows to show"
          : `Rows ${num(rangeFrom)}–${num(rangeTo)} of ${num(filtered.length)}`,
      prevHref: page > 1 ? hrefFor(params, { page: String(page - 1) }) : null,
      nextHref: page < pageCount ? hrefFor(params, { page: String(page + 1) }) : null,
    },
    notes: [
      "One row per unit. Quantity is 1 on every row: the listing stores a row per unit — accessories included, under minted book ids — so nothing here is grouped.",
      "Carrying value is the listed unit cost. No reserve is allocated to any unit; the reserve conclusion is undetermined.",
      "Age runs from the unit's last movement to the balance-sheet date — the same basis, and the same buckets, the Valuation aging uses.",
      "An exception chip marked SKU or bin names that SKU or bin, not this unit. Only a finding carrying the serial, or the custodian recorded as holding the unit, names the unit itself.",
      "Custody says who holds the unit; ownership is the accounting conclusion beside it. No unit on this listing is consignment custody, because this listing is what the company owns — the vendor-owned stock held on site is recorded off-book and is reported under Custody & Disposition.",
    ],
  };
}
