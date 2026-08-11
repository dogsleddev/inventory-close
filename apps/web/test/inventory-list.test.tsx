// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { InventorySearchScreen } from "../components/InventorySearchScreen";
import { buildShellData } from "../lib/server/data";
import { buildInventorySearchData } from "../lib/server/financial-life-view";
import {
  buildInventoryListData,
  INVENTORY_PAGE_SIZE,
  type InventoryListParams,
} from "../lib/server/inventory-list-view";
import { getQueries, makeContext } from "../lib/server/workspace";

/**
 * All-Inventory master list (COMPLETION_PLAN §4).
 *
 * The regressions worth keeping are the honesty ones. A master list is the
 * easiest surface in the product on which to over-claim: it puts fifteen
 * derived columns beside a unit id, and every one of them is an opportunity
 * to state as fact something no rule concluded. So these tests pin
 * population-vs-unit exception language, ownership language, the "quantity
 * is 1" contract, and the fact that nothing off the year-end listing can
 * appear here — alongside the ordinary ones about filtering and paging.
 */

afterEach(cleanup);
const noopRole = vi.fn(async () => {});

const services = () => ({
  queries: getQueries(),
  ctx: makeContext(userByRole("CONTROLLER"), "T-INVLIST"),
});

function view(
  params: InventoryListParams = {},
  role: Parameters<typeof userByRole>[0] = "CONTROLLER",
) {
  return buildInventoryListData(userByRole(role), params, "T-INVLIST");
}

function renderList(
  params: InventoryListParams = {},
  role: Parameters<typeof userByRole>[0] = "CONTROLLER",
) {
  const user = userByRole(role);
  return render(
    <InventorySearchScreen
      shell={buildShellData(user, "T-INVLIST")}
      data={buildInventorySearchData(user, params.q ?? "", "T-INVLIST")}
      master={buildInventoryListData(user, params, "T-INVLIST")}
      setRoleAction={noopRole}
    />,
  );
}

/**
 * A filter that resolves to a single row. Rendering a hundred fifteen-column
 * rows costs real time, and a test about page chrome does not need them.
 */
const ONE_ROW: InventoryListParams = { q: view().rows[0]?.serial ?? "" };

/** The master table, told apart from the serial-search results table. */
const masterTable = (): HTMLElement => {
  const panel = screen.getByText("All inventory").closest("section") as HTMLElement;
  return within(panel).getByRole("table");
};
const bodyRows = (): HTMLElement[] =>
  Array.from(masterTable().querySelectorAll("tbody tr")) as HTMLElement[];

describe("the master list is the whole book population", () => {
  it("names the population the close derived, never a transcribed number", () => {
    const { queries, ctx } = services();
    const units = queries.listInventoryUnits(ctx).length;
    renderList(ONE_ROW);
    expect(
      screen.getByText(new RegExp(`${units.toLocaleString("en-US")} units on the year-end listing`)),
    ).toBeTruthy();
  });

  it("renders one row per unit, a page at a time", () => {
    const data = view();
    const { queries, ctx } = services();
    const units = queries.listInventoryUnits(ctx).length;
    expect(units).toBeGreaterThan(INVENTORY_PAGE_SIZE);
    expect(data.paging.pageCount).toBe(Math.ceil(units / INVENTORY_PAGE_SIZE));
    renderList();
    expect(bodyRows()).toHaveLength(INVENTORY_PAGE_SIZE);
  });

  it("carries the fifteen columns the master view promises", () => {
    renderList();
    const headers = Array.from(masterTable().querySelectorAll("thead th")).map(
      (th) => th.textContent,
    );
    expect(headers).toEqual([
      "Serial",
      "SKU",
      "Product",
      "Qty",
      "Location",
      "Custody",
      "Classification",
      "Ownership",
      "Unit cost",
      "Carrying",
      "GL",
      "Last count",
      "Age",
      "Exception",
      "Status",
    ]);
  });

  it("shows quantity 1 on every row and says why in the notes", () => {
    const data = view();
    expect(data.rows.every((r) => r.quantity === "1")).toBe(true);
    renderList(ONE_ROW);
    expect(screen.getByText(/Quantity is 1 on every row/)).toBeTruthy();
    expect(screen.getByText(/nothing here is grouped/)).toBeTruthy();
  });

  it("opens a unit's Financial Life from its row", () => {
    const data = view();
    const first = data.rows[0];
    expect(first).toBeDefined();
    renderList(ONE_ROW);
    const link = within(masterTable()).getByRole("link", { name: first?.serial ?? "" });
    expect(link.getAttribute("href")).toBe(`/inventory/${first?.serial}`);
  });

  it("holds every row inside the table's own scroll container", () => {
    const { container } = renderList();
    const panel = screen.getByText("All inventory").closest("section") as HTMLElement;
    expect(panel.querySelector(".icg-table-wrap")?.contains(masterTable())).toBe(true);
    // A hundred fifteen-column rows is a page a browser renders without
    // complaint; the whole 1,500-row population in one DOM would not be.
    expect(container.querySelectorAll("*").length).toBeLessThan(6000);
  });

  it("keeps the serial search on the page, reaching past the listing", () => {
    renderList({ q: "KE-E2-1048" });
    expect(screen.getByLabelText("Serial search")).toBeTruthy();
    const hits = screen.getByText(/Serial search — /).closest("section") as HTMLElement;
    expect(within(hits).getByText("On the listing")).toBeTruthy();
  });
});

describe("filtering happens on the server, from the query string", () => {
  it("narrows the population and reports the filter's own counts", () => {
    const all = view();
    const sku = all.rows[0]?.sku ?? "";
    const filtered = view({ sku });
    const { queries, ctx } = services();
    const expected = queries
      .listInventoryMaster(ctx)
      .rows.filter((r) => r.sku === sku).length;
    expect(filtered.paging.rangeNote).toContain(expected.toLocaleString("en-US"));
    expect(filtered.resultNote).toContain("match");
    expect(filtered.activeFilterCount).toBe(1);
    renderList({ sku });
    for (const row of bodyRows()) {
      expect(within(row).getByText(sku)).toBeTruthy();
    }
  });

  it("offers every filter the brief asks for, each with an accessible name", () => {
    renderList(ONE_ROW);
    for (const label of [
      "SKU",
      "Location",
      "Custody",
      "Classification",
      "GL account",
      "Ownership",
      "Count status",
      "Age band",
      "Exception",
    ]) {
      expect(
        screen.getByLabelText(`Filter by ${label}`),
        `no ${label} filter`,
      ).toBeTruthy();
    }
    expect(screen.getByLabelText("Serial search")).toBeTruthy();
  });

  it("submits as a GET form so the URL is the whole filter state", () => {
    const { container } = renderList({ sku: "KE-M1" });
    const form = container.querySelector('form[action="/inventory"]') as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("get");
    const select = screen.getByLabelText("Filter by SKU") as HTMLSelectElement;
    expect(select.value).toBe("KE-M1");
    // `page` is not a field, so changing a filter can never land the reader
    // on a page number that belonged to the previous result set.
    expect(container.querySelector('[name="page"]')).toBeNull();
  });

  it("filters by age band on the valuation workspace's own buckets", () => {
    const { queries, ctx } = services();
    const valuation = queries.getValuation(ctx);
    const bucket = valuation.aging.find((b) => b.units > 0);
    expect(bucket).toBeDefined();
    const filtered = view({ age: bucket?.key });
    expect(filtered.paging.rangeNote).toContain((bucket?.units ?? 0).toLocaleString("en-US"));
  });

  it("says a filter found nothing rather than showing an empty table", () => {
    const data = view({ q: "NO-SUCH-SERIAL-AT-ALL" });
    expect(data.rows).toHaveLength(0);
    expect(data.emptyNote).toContain("verified empty");
    renderList({ q: "NO-SUCH-SERIAL-AT-ALL" });
    expect(screen.getByText(/No unit on the year-end listing matches these filters/)).toBeTruthy();
  });

  it("pages without losing the filters, and clamps a page out of range", () => {
    const first = view();
    const second = view({ page: "2" });
    expect(second.rows[0]?.serial).not.toBe(first.rows[0]?.serial);
    expect(second.paging.prevHref).toBe("/inventory?page=1");
    const filteredPage = view({ cls: "FINISHED_HARDWARE", page: "2" });
    expect(filteredPage.paging.prevHref).toContain("cls=FINISHED_HARDWARE");
    const beyond = view({ page: "9999" });
    expect(beyond.paging.page).toBe(beyond.paging.pageCount);
    expect(beyond.rows.length).toBeGreaterThan(0);
  });
});

describe("a population is never rendered as a named unit", () => {
  const populationRow = () => {
    const { queries, ctx } = services();
    const rows = queries.listInventoryMaster(ctx).rows;
    const row = rows.find(
      (r) => r.exceptions.length > 0 && r.exceptions.every((e) => !e.identifiesUnit),
    );
    expect(row, "the dataset must contain a population-only linkage").toBeDefined();
    return row;
  };

  it("marks a SKU/bin linkage as a population and says what it named", () => {
    const row = populationRow();
    const data = view({ q: row?.serial });
    const rendered = data.rows.find((r) => r.serial === row?.serial);
    expect(rendered?.exceptions.length).toBeGreaterThan(0);
    for (const chip of rendered?.exceptions ?? []) {
      expect(chip.namesUnit).toBe(false);
      expect(chip.basisNote).toContain("not this unit");
    }
    renderList({ q: row?.serial });
    const cells = within(masterTable()).getAllByTitle(/not this unit/);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]?.textContent).toContain("population");
  });

  it("leaves the status of such a row saying no exception names it", () => {
    const row = populationRow();
    const data = view({ q: row?.serial });
    expect(data.rows.find((r) => r.serial === row?.serial)?.status.label).toBe("None named");
  });

  it("states the rule in the notes rather than leaving the reader to infer it", () => {
    renderList(ONE_ROW);
    expect(screen.getByText(/names that SKU or bin, not this unit/)).toBeTruthy();
  });

  it("shows a serial-named exception without the population marker", () => {
    const { queries, ctx } = services();
    const named = queries
      .listInventoryMaster(ctx)
      .rows.find((r) => r.exceptions.some((e) => e.identifiesUnit && e.open));
    expect(named).toBeDefined();
    const data = view({ q: named?.serial });
    const rendered = data.rows.find((r) => r.serial === named?.serial);
    const chip = rendered?.exceptions.find((e) => e.namesUnit);
    expect(chip?.basisNote).toMatch(/names this serial|names the custodian/);
    expect(rendered?.status.label).not.toBe("None named");
    renderList({ q: named?.serial });
    expect(within(masterTable()).getByRole("link", { name: chip?.id ?? "" })).toBeTruthy();
  });

  it("filters the two linkages apart", () => {
    const named = view({ exc: "named" });
    const population = view({ exc: "population" });
    expect(named.rows.every((r) => r.exceptions.some((e) => e.namesUnit))).toBe(true);
    expect(population.rows.every((r) => r.exceptions.every((e) => !e.namesUnit))).toBe(true);
    expect(population.rows.every((r) => r.exceptions.length > 0)).toBe(true);
  });
});

describe("ownership and custody are stated as what they are", () => {
  it("labels the ordinary case as the recorded assertion, not as proof", () => {
    const data = view();
    expect(data.rows.some((r) => r.ownership === "Company-owned (recorded)")).toBe(true);
  });

  it("says rights are under review where an open exception disputes them", () => {
    const { queries, ctx } = services();
    const disputed = queries
      .listInventoryMaster(ctx)
      .rows.find((r) => r.ownership === "UNDER_REVIEW");
    expect(disputed).toBeDefined();
    const rendered = view({ q: disputed?.serial }).rows.find(
      (r) => r.serial === disputed?.serial,
    );
    expect(rendered?.ownership).toBe("Rights under review");
    expect(rendered?.ownershipUnderReview).toBe(true);
    renderList({ q: disputed?.serial });
    expect(within(masterTable()).getAllByText("Rights under review").length).toBeGreaterThan(0);
  });

  it("never renders a book unit as consignment custody, and says why", () => {
    // The listing is what the company OWNS, so no row on it can be
    // vendor-owned stock. That is still true and still worth stating.
    const data = view();
    expect(data.rows.some((r) => r.custody.startsWith("Consignment"))).toBe(false);
    const custody = data.filters.find((f) => f.name === "custody");
    expect(custody?.options.some((o) => o.value.startsWith("CONSIGNMENT"))).toBe(false);
    renderList(ONE_ROW);
    expect(screen.getByText(/No unit on this listing is consignment custody/)).toBeTruthy();

    // What is NOT true any more: at dataset v1.2.0 twelve vendor-owned units
    // ship in their own off-book collection, so the note this screen used to
    // carry — that no FY2026 record establishes a consignment arrangement —
    // became false the moment those fixtures landed. It must not come back.
    expect(screen.queryByText(/no FY2026 record establishes a consignment/i)).toBeNull();
    expect(screen.queryByText(/have no population here/)).toBeNull();
  });

  it("carries the custodian beside third-party custody", () => {
    const { queries, ctx } = services();
    const held = queries
      .listInventoryMaster(ctx)
      .rows.find((r) => r.custodian !== undefined);
    expect(held).toBeDefined();
    const rendered = view({ q: held?.serial }).rows.find((r) => r.serial === held?.serial);
    expect(rendered?.custodian).toBe(held?.custodian);
  });
});

describe("count coverage and value are not overstated", () => {
  it("says outright when no count line covers a unit", () => {
    const uncovered = view({ count: "none" });
    expect(uncovered.rows.length).toBeGreaterThan(0);
    expect(uncovered.rows.every((r) => r.lastCount === null)).toBe(true);
    renderList({ count: "none" });
    expect(within(masterTable()).getAllByText("No count line covers it").length).toBeGreaterThan(0);
  });

  it("marks SKU-level coverage as covering the bin, not the unit", () => {
    const skuLevel = view({ count: "sku" });
    expect(skuLevel.rows.length).toBeGreaterThan(0);
    expect(
      skuLevel.rows.every((r) => r.lastCount?.variance?.includes("unit not named") === true ||
        r.lastCount?.variance?.startsWith("SKU / bin line") === true),
    ).toBe(true);
  });

  it("prints carrying value gross, and says the reserve is not in it", () => {
    renderList(ONE_ROW);
    expect(screen.getByText(/No reserve is allocated to any unit/)).toBeTruthy();
  });
});

describe("the screen keeps the structural contracts it inherits", () => {
  it("pairs every row overlay with a lifted ID link", () => {
    renderList(ONE_ROW);
    const overlays = Array.from(document.querySelectorAll(".icg-row-btn"));
    for (const overlay of overlays) {
      const cell = overlay.closest("td");
      if (cell === null) continue;
      expect((cell as HTMLElement).style.position).toBe("");
      const link = cell.querySelector("a");
      if (link !== null) expect(link.className).toContain("icg-row-link");
    }
  });

  it("says so to a role that may not read the close", () => {
    const data = view({}, "SYSTEM_ADMIN");
    expect(data.restricted).toBe(true);
    expect(data.rows).toHaveLength(0);
    renderList({}, "SYSTEM_ADMIN");
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.queryByText("All inventory")).toBeNull();
  });
});
