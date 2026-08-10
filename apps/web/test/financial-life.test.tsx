// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { FinancialLifeScreen } from "../components/FinancialLifeScreen";
import { InventorySearchScreen } from "../components/InventorySearchScreen";
import { buildShellData } from "../lib/server/data";
import {
  buildFinancialLifeData,
  buildInventorySearchData,
} from "../lib/server/financial-life-view";
import { getQueries, makeContext } from "../lib/server/workspace";

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
const FLAGSHIP = "KE-E2-1048";

function renderLife(serial: string, role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <FinancialLifeScreen
      shell={buildShellData(user, "T-LIFE")}
      data={buildFinancialLifeData(user, serial, "T-LIFE")}
      setRoleAction={noopRole}
    />,
  );
}

function services() {
  const user = userByRole("CONTROLLER");
  return { queries: getQueries(), ctx: makeContext(user, "T-LIFE-SVC") };
}

describe("Financial Life — flagship serial", () => {
  it("renders the unit header from services: book state, physical state, exception", () => {
    renderLife(FLAGSHIP);
    expect(screen.getByRole("heading", { level: 1, name: FLAGSHIP })).toBeTruthy();
    expect(screen.getByText("SKU KE-E2")).toBeTruthy();
    // Header stat and the NETSUITE STATE phase card both state the book
    // position — that is the design, so assert presence, not uniqueness.
    expect(screen.getAllByText("Primary Warehouse Inventory").length).toBeGreaterThan(0);
    expect(screen.getByText("At customer site")).toBeTruthy();
    // Header stat, chip, and phase cards all reach EXC-001 — every one of
    // them must go to the same destination.
    const links = screen.getAllByRole("link", { name: /EXC-001/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/exceptions/EXC-001");
    }
  });

  it("renders the carrier's real delivered state — never the mockup's 'in transit' (§9a-2)", () => {
    const { queries, ctx } = services();
    const life = queries.getFinancialLife(ctx, FLAGSHIP);
    expect(life.sellSide.deliveredAt).toBeDefined();
    renderLife(FLAGSHIP);
    expect(screen.getByText(/^Delivered/)).toBeTruthy();
    expect(screen.queryByText(/in transit/i)).toBeNull();
  });

  it("keeps the missing provision visibly missing, outside any positive state", () => {
    const { queries, ctx } = services();
    const exc = queries
      .listExceptions(ctx)
      .find((e) => e.exception.id === "EXC-001");
    const unmet = exc?.exception.finding.evidenceRequirements.find(
      (r) => r.required && !r.satisfied,
    );
    expect(unmet).toBeDefined();
    renderLife(FLAGSHIP);
    // The requirement text renders as a required-missing card, tagged with
    // the rule that needs it.
    expect(screen.getAllByText(unmet?.description ?? "").length).toBeGreaterThan(0);
    expect(screen.getByText(/MISSING · required for CUT-OUT-001/)).toBeTruthy();
  });

  it("marks invoice and telemetry as non-conclusive evidence", () => {
    renderLife(FLAGSHIP);
    expect(screen.getAllByText(/billing evidence only/).length).toBeGreaterThan(0);
    expect(screen.getByText("Corroborating only")).toBeTruthy();
    // The management conclusion comes from the exception workflow, not from
    // the invoice, telemetry, or location.
    expect(screen.getByText("Management conclusion: Open")).toBeTruthy();
  });

  it("summarizes the chain as component coverage, not a score", () => {
    const { queries, ctx } = services();
    const chain = queries
      .getCommercialChains(ctx)
      .find((c) => c.subjectRef === "SO-26184");
    expect(chain).toBeDefined();
    renderLife(FLAGSHIP);
    expect(
      screen.getByText(
        new RegExp(
          `${chain?.presentCount} of ${chain?.totalCount} components present`,
        ),
      ),
    ).toBeTruthy();
    expect(screen.getByText(/not a score and not a measure of accounting confidence/)).toBeTruthy();
  });

  it("opens the source-record drawer from a transaction chip (occurred vs retrieved)", async () => {
    const user = userEvent.setup();
    const { queries, ctx } = services();
    const life = queries.getFinancialLife(ctx, FLAGSHIP);
    const po = life.buySide.purchaseOrder ?? "";
    renderLife(FLAGSHIP);
    await user.click(screen.getAllByRole("button", { name: po })[0] as HTMLElement);
    const drawer = screen.getByRole("complementary", { name: `Evidence record ${po}` });
    expect(within(drawer).getByText("Occurred")).toBeTruthy();
    expect(within(drawer).getByText("Retrieved")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: `Evidence record ${po}` }),
    ).toBeNull();
  });

  it("shows the count history under the management-risk tag", () => {
    renderLife(FLAGSHIP);
    expect(screen.getByText("MANAGEMENT RISK CONTEXT")).toBeTruthy();
    expect(screen.getByText(/implies no auditor reliance/)).toBeTruthy();
  });
});

describe("Financial Life — off-book and unknown serials", () => {
  it("renders the off-book discovery without implying book membership", () => {
    const { queries, ctx } = services();
    const offBook = queries
      .listExceptions(ctx)
      .find((e) => e.exception.finding.ruleId === "CNT-COMP-001");
    const serial = offBook?.exception.finding.subjects.serials?.[0] ?? "";
    expect(serial).not.toBe("");
    renderLife(serial);
    expect(screen.getByText("Not on the year-end listing")).toBeTruthy();
    expect(screen.getByText("No year-end book record")).toBeTruthy();
    expect(screen.getByText(/never auto-added/i)).toBeTruthy();
    // No fabricated accounting position for a unit that is not on the book.
    expect(screen.queryByText("Accounting position")).toBeNull();
  });

  it("reports an unknown serial as verified empty, never as a zero", () => {
    renderLife("KE-Z9-0000");
    expect(screen.getByText(/verified empty, not assumed/)).toBeTruthy();
  });
});

describe("Inventory serial search", () => {
  function renderSearch(query: string) {
    const user = userByRole("CONTROLLER");
    return render(
      <InventorySearchScreen
        shell={buildShellData(user, "T-SEARCH")}
        data={buildInventorySearchData(user, query, "T-SEARCH")}
        setRoleAction={noopRole}
      />,
    );
  }

  it("reaches Financial Life in one click from a hit", () => {
    renderSearch(FLAGSHIP);
    // The serial may also appear as an open-exception entry chip — assert
    // the hit row inside the results table.
    const table = screen.getByRole("table");
    const link = within(table).getByRole("link", { name: FLAGSHIP });
    expect(link.getAttribute("href")).toBe(`/inventory/${FLAGSHIP}`);
    expect(screen.getByText("On the listing")).toBeTruthy();
  });

  it("says out loud when a hit is not on the year-end book", () => {
    const { queries, ctx } = services();
    const offBook = queries
      .listExceptions(ctx)
      .find((e) => e.exception.finding.ruleId === "CNT-COMP-001");
    const serial = offBook?.exception.finding.subjects.serials?.[0] ?? "";
    renderSearch(serial);
    expect(screen.getByText("Not on the listing")).toBeTruthy();
  });
});
