// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userByRole } from "@icg/data";
import {
  getConsignmentHoldings,
  getCustodyBreakdown,
  getDispositions,
  getEoMethodology,
} from "@icg/services";
import { CustodyScreen } from "../components/CustodyScreen";
import { ValuationScreen } from "../components/ValuationScreen";
import { buildShellData } from "../lib/server/data";
import { buildCustodyData } from "../lib/server/custody-view";
import { buildValuationData } from "../lib/server/valuation-view";
import { buildCsv } from "../lib/server/export-csv";
import { formatCents } from "../lib/format";
import { getWorkspace, makeContext } from "../lib/server/workspace";

/**
 * Stage E — custody, consignment, disposition, and E&O methodology.
 *
 * The screen risk here is different from Stage D's. Stage D had to avoid
 * claiming more than it measured; Stage E has to avoid letting a reader ADD
 * two populations that must never be added — company-owned stock held
 * elsewhere, and someone else's stock held here — and has to carry the
 * largest money figure in the product (stock beyond a forecast horizon)
 * without it reading as a reserve.
 */

afterEach(cleanup);
const noopRole = vi.fn(async () => {});
const user = (role: Parameters<typeof userByRole>[0] = "CONTROLLER") => userByRole(role);

const renderCustody = (tab?: string) =>
  render(
    <CustodyScreen
      shell={buildShellData(user(), "T-E")}
      data={buildCustodyData(user(), "T-E")}
      {...(tab !== undefined ? { initialTab: tab } : {})}
      setRoleAction={noopRole}
    />,
  );

const renderValuation = () =>
  render(
    <ValuationScreen
      shell={buildShellData(user(), "T-E")}
      data={buildValuationData(user(), "T-E")}
      setRoleAction={noopRole}
    />,
  );

const ctx = () => makeContext(user(), "T-E");
const csv = (table: "custody" | "valuation") => buildCsv(user(), table, "T-E").body;

/** A labelled row's cell at a column: pins the value to its own place. */
const cellAt = (body: string, label: string, column: number): string => {
  const line = body.split("\r\n").find((l) => l.startsWith('"' + label + '"'));
  expect(line, `no row labelled ${label}`).toBeDefined();
  return (line ?? "").slice(1, -1).split('","')[column] ?? "";
};

describe("the three populations are never presented as addable", () => {
  it("keeps company-owned custody and vendor-owned stock on separate tabs", () => {
    const custody = getCustodyBreakdown(getWorkspace(), ctx());
    const consign = getConsignmentHoldings(getWorkspace(), ctx());

    // The custody tab shows company-owned stock only; the consignment total
    // must not appear on it.
    renderCustody("custody");
    expect(screen.queryByText(formatCents(consign.statedValueCents))).toBeNull();
    // And their sum appears nowhere, on either tab.
    const combined = formatCents(custody.bookCarryingCents + consign.statedValueCents);
    expect(screen.queryByText(combined)).toBeNull();
    cleanup();
    renderCustody("consignment");
    expect(screen.queryByText(combined)).toBeNull();
    expect(screen.queryByText(formatCents(custody.bookCarryingCents))).toBeNull();
  });

  it("labels the consignment tab with the ownership fact, not just a count", () => {
    // The tab strip puts a count of 12 beside a count of 1,500-unit
    // populations. The label has to carry the distinction, because the strip
    // is read before the tab body.
    const data = buildCustodyData(user(), "T-E");
    const tab = data.tabs.find((t) => t.key === "consignment");
    expect(tab?.label).toMatch(/vendor-owned/i);
  });

  it("says every custody row is company-owned wherever it sits", () => {
    renderCustody("custody");
    expect(
      screen.getByText(/Every unit here is company-owned, wherever it physically sits/),
    ).toBeTruthy();
    expect(screen.getByText(/Location is not ownership/)).toBeTruthy();
  });
});

describe("locations render the names the dataset gives them", () => {
  it("uses the dataset's own name, not a title-cased id", () => {
    // Found by opening the page: every screen using `locationLabel` was
    // rendering "Rma Repair" and "Staging" instead of "RMA / Repair" and
    // "Shipping / Install Staging". `registerLocationNames` was guarded by a
    // flag on globalThis while the map it fills lives in `humanize.ts`, so a
    // dev-server module reload gave the map a fresh empty instance while the
    // flag stayed true and registration never ran again. A guard has to live
    // in the same module as the state it guards.
    //
    // What this test catches is a screen going back to title-casing the id
    // itself. It does NOT catch the reload desync — a test process calls
    // `getQueries()` for the first time and registers correctly, so the old
    // code passes here too. That failure is only reachable on a running dev
    // server, in the same category as WORKSPACE_SHAPE.
    //
    // Pinned on the names that DIFFER from title-casing the id — the ones
    // that agree would pass either way and prove nothing.
    const locations = getWorkspace().dataset.locations;
    const divergent = locations.filter(
      (l) =>
        l.name !==
        l.id
          .toLowerCase()
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
    );
    expect(divergent.length, "no location name differs from its title-cased id").toBeGreaterThan(0);

    renderCustody("custody");
    const rendered = document.body.textContent ?? "";
    const custody = getCustodyBreakdown(getWorkspace(), ctx());
    const shown = new Set(custody.rows.flatMap((r) => r.locations));
    for (const location of divergent.filter((l) => shown.has(l.id))) {
      expect(rendered, location.id).toContain(location.name);
    }
  });
});

describe("each separation claim is rendered from a measurement", () => {
  it("states the three claims, and keeps both branches out of the component", () => {
    const consign = getConsignmentHoldings(getWorkspace(), ctx());
    const disp = getDispositions(getWorkspace(), ctx());
    const custody = getCustodyBreakdown(getWorkspace(), ctx());
    expect(consign.outsideSubledger).toBe(true);
    expect(disp.removedFromBook).toBe(true);
    expect(custody.coversBook).toBe(true);

    renderCustody("consignment");
    expect(screen.getByText(/None of this stock is in the inventory balance\./)).toBeTruthy();
    cleanup();
    renderCustody("disposition");
    expect(screen.getByText(/None of these units is on the year-end listing\./)).toBeTruthy();
    cleanup();
    renderCustody("custody");
    expect(
      screen.getByText(/Every unit on the listing resolves to exactly one custody answer\./),
    ).toBeTruthy();

    // A screen that can only say the good news is prose with a boolean in
    // front of it. Both branches live in the view builder and are CHOSEN.
    const component = readFileSync(
      join(import.meta.dirname, "..", "components", "CustodyScreen.tsx"),
      "utf8",
    );
    const view = readFileSync(
      join(import.meta.dirname, "..", "lib", "server", "custody-view.ts"),
      "utf8",
    );
    for (const sentence of [
      "None of this stock is in the inventory balance.",
      "None of these units is on the year-end listing.",
      "Every unit on the listing resolves to exactly one custody answer.",
    ]) {
      expect(component, sentence).not.toContain(sentence);
      expect(view, sentence).toContain(sentence);
    }
    for (const negative of [
      "Consigned stock is reaching the inventory balance.",
      "A disposed unit is still on the year-end listing.",
      "The custody cut does not account for the whole listing.",
    ]) {
      expect(view, negative).toContain(negative);
    }
    expect(view).toContain("consignment.outsideSubledger");
    expect(view).toContain("dispositions.removedFromBook");
    expect(view).toContain("custody.coversBook");
  });
});

describe("named support that does not resolve says so", () => {
  it("never renders a reference as though the close held it", () => {
    const disp = getDispositions(getWorkspace(), ctx());
    expect(disp.rowsWithAdjustmentOnFile).toBe(0);
    expect(disp.rowsWithEvidenceOnFile).toBe(0);

    renderCustody("disposition");
    const table = screen.getAllByRole("table")[0] as HTMLElement;
    for (const row of disp.rows) {
      const tr = within(table).getByText(row.id).closest("tr");
      const text = tr?.textContent ?? "";
      // The reference is shown as the source record wrote it...
      expect(text, row.id).toContain(row.adjustmentRef ?? "");
      expect(text, row.id).toContain(row.evidenceRef ?? "");
      // ...and immediately qualified, so nothing reads as available.
      expect(text, row.id).toContain("not in the close's adjustments");
      expect(text, row.id).toContain("not held in the evidence system");
    }
    // There is no control offering to open any of it.
    expect(screen.queryByRole("link", { name: /certificate/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /certificate/i })).toBeNull();
  });

  it("never links a serial that has no book record", () => {
    // Every consigned and disposed serial is off the book by construction, so
    // a link to /inventory/<serial> would 404 on a unit the screen just
    // displayed.
    const consign = getConsignmentHoldings(getWorkspace(), ctx());
    for (const tab of ["consignment", "disposition"] as const) {
      cleanup();
      renderCustody(tab);
      const links = screen.queryAllByRole("link");
      for (const link of links) {
        expect(link.getAttribute("href") ?? "", tab).not.toMatch(/^\/inventory\//);
      }
    }
    expect(consign.rows.length).toBeGreaterThan(0);
  });
});

describe("the E&O methodology never becomes a reserve", () => {
  it("keeps the excess figure away from the reserve, and qualifies it", () => {
    const eo = getEoMethodology(getWorkspace(), ctx());
    expect(eo.excessOverHorizonCents).toBeGreaterThan(0);
    renderValuation();

    // The figure is present, and the sentence that makes it safe is present
    // with it — not in a footnote elsewhere on the page.
    expect(screen.getByText(/no recovery rate has been applied to it/)).toBeTruthy();
    expect(screen.getByText(/not an exposure, not a proposed write-down/)).toBeTruthy();

    // The existing reserve guarantees still hold on this screen.
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
    expect(screen.queryByText(/write.?off/i)).toBeNull();
    expect(screen.getByText("UNDETERMINED")).toBeTruthy();
  });

  it("states every absence rather than leaving a cell blank", () => {
    const eo = getEoMethodology(getWorkspace(), ctx());
    renderValuation();
    expect(eo.recovery.skusWithoutObservedPrice.length).toBeGreaterThan(0);
    // Named, because a blank price cell on aged stock reads as a price of zero.
    expect(
      screen.getByText(eo.recovery.skusWithoutObservedPrice.join(", ")),
    ).toBeTruthy();
    expect(screen.getByText("Not on file")).toBeTruthy();
    expect(screen.getByText("Not computed")).toBeTruthy();
    // Condition is the leg the close does not have, and it says so.
    expect(screen.getByText(/Condition is the leg of the method the close does not have/))
      .toBeTruthy();
  });

  it("discloses the aging basis as a choice, with what another clock would select", () => {
    const eo = getEoMethodology(getWorkspace(), ctx());
    renderValuation();
    expect(eo.agingBasis.agedOnAcquisitionBasis).toBeGreaterThan(
      eo.agingBasis.agedOnPolicyBasis,
    );
    expect(screen.getByText(String(eo.agingBasis.agedOnAcquisitionBasis))).toBeTruthy();
    expect(screen.getByText(/it is a choice, not a fact/)).toBeTruthy();
  });

  it("carries the ratable-demand assumption with the figure it produces", () => {
    renderValuation();
    // Months of supply is only meaningful under an assumption the dataset
    // does not carry. The assumption travels with the number.
    expect(screen.getByText(/Demand is assumed to arrive ratably/)).toBeTruthy();
  });
});

describe("the custody file carries what the screens show", () => {
  it("writes three sections and never totals across them", () => {
    const body = csv("custody");
    const custody = getCustodyBreakdown(getWorkspace(), ctx());
    const consign = getConsignmentHoldings(getWorkspace(), ctx());
    const disp = getDispositions(getWorkspace(), ctx());
    for (const heading of [
      "PHYSICAL CUSTODY (COMPANY-OWNED STOCK)",
      "CONSIGNMENT IN (VENDOR-OWNED, NOT COMPANY INVENTORY)",
      "DISPOSITION (UNITS THAT LEFT THE BOOK IN FY2026)",
      "BY METHOD",
    ]) {
      expect(body, heading).toContain(heading);
    }
    // Bound to their own labels and columns.
    expect(cellAt(body, "Total on the listing", 6)).toBe(
      formatCents(custody.bookCarryingCents),
    );
    expect(cellAt(body, "Total held on consignment", 7)).toBe(
      formatCents(consign.statedValueCents),
    );
    expect(cellAt(body, "Custody accounts for the whole listing", 1)).toBe("YES");
    expect(cellAt(body, "Outside the inventory subledger", 1)).toBe("YES");
    expect(cellAt(body, "None of these units is on the listing", 1)).toBe("YES");
    // The one arithmetic a reader must never be handed.
    expect(body).not.toContain(
      formatCents(custody.bookCarryingCents + consign.statedValueCents),
    );
    expect(body).not.toContain(
      formatCents(custody.bookCarryingCents + disp.originalCostCents),
    );
  });

  it("separates a named reference from whether it resolves", () => {
    const body = csv("custody");
    const disp = getDispositions(getWorkspace(), ctx());
    const header = body
      .split("\r\n")
      .find((l) => l.startsWith('"Record"'))
      ?.slice(1, -1)
      .split('","') ?? [];
    const namedAt = header.indexOf("Adjustment named");
    const onFileAt = header.indexOf("Adjustment on file");
    const certAt = header.indexOf("Certificate named");
    const certOnFileAt = header.indexOf("Certificate on file");
    expect(Math.min(namedAt, onFileAt, certAt, certOnFileAt)).toBeGreaterThan(-1);
    for (const r of disp.rows) {
      const cells =
        body
          .split("\r\n")
          .find((l) => l.startsWith('"' + r.id + '"'))
          ?.slice(1, -1)
          .split('","') ?? [];
      expect(cells[namedAt], r.id).toBe(r.adjustmentRef);
      expect(cells[onFileAt], r.id).toBe("NO");
      expect(cells[certAt], r.id).toBe(r.evidenceRef);
      expect(cells[certOnFileAt], r.id).toBe("NO");
    }
  });

  it("keeps every disposition method's own outcome rather than a blend", () => {
    const body = csv("custody");
    const disp = getDispositions(getWorkspace(), ctx());
    for (const m of disp.byMethod) {
      const cells =
        body
          .split("\r\n")
          .find((l) => l.startsWith('"' + m.method + '"'))
          ?.slice(1, -1)
          .split('","') ?? [];
      expect(cells[4], m.method).toBe(formatCents(m.lossCents));
    }
    // A vendor return at full credit cost nothing, and it is the largest
    // record here — a blended rate would bury that.
    expect(disp.byMethod.find((m) => m.method === "RETURNED_TO_VENDOR")?.lossCents).toBe(0);
    expect(body).toContain("It is not a recovery rate");
  });
});

describe("the valuation file keeps its reserve guarantee with the new sections", () => {
  /** The block of a sectioned file between one heading and the next. */
  const section = (body: string, heading: string): string => {
    const at = body.indexOf('"' + heading + '"');
    expect(at, `no section headed ${heading}`).toBeGreaterThan(-1);
    const rest = body.slice(at + heading.length);
    const next = rest.search(/\r\n"[A-Z][A-Z ()/—-]{6,}"\r\n/);
    return next === -1 ? rest : rest.slice(0, next);
  };

  it("leaves exactly one money figure in the reserve block", () => {
    // The section splitter only recognises A–Z, space, parens, slash and
    // hyphen as a heading. A Stage E heading it cannot see would silently
    // extend RESERVE POSITION through the new sections and their dollars.
    const body = csv("valuation");
    const amounts = section(body, "RESERVE POSITION").match(/\(?\$[\d,]+(?:\.\d\d)?\)?/g) ?? [];
    expect(amounts).toHaveLength(1);
  });

  it("places every new section after the reserve blocks, not between them", () => {
    // Placement is what makes the assertion above safe, and it is the thing a
    // later edit would change without noticing: the reserve slice runs to the
    // NEXT recognised heading, so a methodology section inserted higher up
    // pulls its dollar figures into the reserve block. Pin the order.
    const body = csv("valuation");
    const at = (heading: string) => {
      const i = body.indexOf('"' + heading + '"');
      expect(i, heading).toBeGreaterThan(-1);
      return i;
    };
    const lastReserveBlock = at("OPEN VALUATION REVIEWS");
    for (const heading of [
      "OBSOLESCENCE INDICATORS BY SKU",
      "AGING BASIS",
      "CONDITION AND RECOVERY EVIDENCE",
    ]) {
      expect(at(heading), `${heading} must follow the reserve blocks`).toBeGreaterThan(
        lastReserveBlock,
      );
    }
    expect(at("RESERVE POSITION")).toBeLessThan(at("INVENTORY AGING"));
  });

  it("is recognised as a boundary by the same splitter the suite uses", () => {
    const body = csv("valuation");
    for (const heading of [
      "OBSOLESCENCE INDICATORS BY SKU",
      "AGING BASIS",
      "CONDITION AND RECOVERY EVIDENCE",
    ]) {
      expect(body, heading).toContain(heading);
      expect(
        new RegExp(`\\r\\n"[A-Z][A-Z ()/—-]{6,}"\\r\\n`).test(`\r\n"${heading}"\r\n`),
        `${heading} is not seen as a section boundary`,
      ).toBe(true);
    }
  });

  it("carries the methodology without deriving a reserve anywhere in the file", () => {
    const body = csv("valuation");
    const eo = getEoMethodology(getWorkspace(), ctx());
    expect(cellAt(body, "Units aged on the policy basis", 1)).toBe(
      String(eo.agingBasis.agedOnPolicyBasis),
    );
    expect(cellAt(body, "Units aged measured from acquisition instead", 1)).toBe(
      String(eo.agingBasis.agedOnAcquisitionBasis),
    );
    expect(cellAt(body, "Costs to complete and sell on file", 1)).toBe("NO");
    expect(cellAt(body, "Net realisable value computed", 1)).toBe("NO");
    expect(cellAt(body, "Aging evidence complete", 1)).toBe("YES");
    // The excess figure appears with its qualification in the same row.
    const excessLine = body.split("\r\n").find((l) => l.startsWith('"Beyond the horizon"'));
    expect(excessLine).toContain(formatCents(eo.excessOverHorizonCents));
    expect(excessLine).toContain("not a proposed write-down");
    // And the file still ends on the guarantee.
    expect(body).toContain("No rule in this product can emit a reserve amount.");
  });

  it("states an absent forecast rather than writing a zero", () => {
    const body = csv("valuation");
    const eo = getEoMethodology(getWorkspace(), ctx());
    // Every SKU has a forecast today, so the branch is not exercised by the
    // data — what is pinned here is that the code states the absence rather
    // than emitting an empty cell that would read as zero demand.
    expect(eo.demandCoverageComplete).toBe(true);
    const source = readFileSync(
      join(import.meta.dirname, "..", "lib", "server", "export-csv.ts"),
      "utf8",
    );
    const branch = source.slice(source.indexOf("OBSOLESCENCE INDICATORS BY SKU"));
    expect(branch).toContain("No forecast on file");
    expect(body).toContain("Named rather than left blank");
  });
});
