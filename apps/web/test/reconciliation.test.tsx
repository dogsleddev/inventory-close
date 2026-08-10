// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { buildShellData } from "../lib/server/data";
import { buildReconciliationData } from "../lib/server/recon-view";
import { getQueries, makeContext } from "../lib/server/workspace";

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderRecon(serial = "", role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <ReconciliationScreen
      shell={buildShellData(user, "T-RECON")}
      data={buildReconciliationData(user, serial, "T-RECON")}
      setRoleAction={noopRole}
    />,
  );
}

function services() {
  const user = userByRole("CONTROLLER");
  return { queries: getQueries(), ctx: makeContext(user, "T-RECON-SVC") };
}

describe("Reconciliation — tabs", () => {
  it("carries the four designed tabs; the financial bridge states its stage honestly", async () => {
    const user = userEvent.setup();
    renderRecon();
    expect(screen.getByRole("tab", { name: /Financial/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Procurement Match/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Commercial Chain/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Serial Integrity/ })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /Financial/ }));
    expect(screen.getByText("Financial bridge — not built yet")).toBeTruthy();
  });
});

describe("Reconciliation — procurement match", () => {
  it("keeps the native NetSuite state and the close state side by side and independent", () => {
    const { queries, ctx } = services();
    const matches = queries.getProcurementMatches(ctx);
    renderRecon();
    // Every match renders both states.
    const panel = screen.getByText("All procurement matches").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(matches.length);
    // Native incomplete + close open (EXC-002)…
    expect(screen.getAllByText("NS 3WM · INCOMPLETE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accounting Review").length).toBeGreaterThan(0);
    // …and native incomplete + no close exception (clean GIT), so neither
    // state is derived from the other.
    const incompleteNativeCleanClose = matches.some(
      (m) => m.nativeNetsuiteMatchStatus !== "PASS" && m.closeMatchStatus === "PASS",
    );
    expect(incompleteNativeCleanClose).toBe(true);
    expect(screen.getAllByText("NS 3WM · PASS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No close exception").length).toBeGreaterThan(0);
  });

  it("features the EXC-002 incomplete year-end example with its absent receipt", () => {
    renderRecon();
    expect(screen.getByText(/Absent at Dec\. 31/)).toBeTruthy();
    const footnotes = screen.getAllByText(/EXC-002/);
    expect(footnotes.length).toBeGreaterThan(0);
    expect(
      screen.getByText(/answer different questions and are reported separately/),
    ).toBeTruthy();
  });

  it("features a resolved-historical example alongside the open one", () => {
    const { queries, ctx } = services();
    const resolved = queries
      .listExceptions(ctx)
      .find(
        (e) =>
          !e.open &&
          e.exception.finding.subjects.transactionNumbers?.some((t) =>
            queries
              .getProcurementMatches(ctx)
              .some(
                (m) =>
                  m.purchaseOrderNumber === t ||
                  m.itemReceiptNumber === t ||
                  m.vendorBillNumber === t,
              ),
          ),
      );
    expect(resolved).toBeDefined();
    renderRecon();
    expect(
      screen.getAllByText(new RegExp(resolved?.exception.id ?? "")).length,
    ).toBeGreaterThan(0);
  });
});

describe("Reconciliation — commercial chain", () => {
  it("features the flagship chain with the delivered carrier state, never 'in transit'", async () => {
    const user = userEvent.setup();
    renderRecon();
    await user.click(screen.getByRole("tab", { name: /Commercial Chain/ }));
    expect(screen.getByText(/Commercial chain — SO-26184/)).toBeTruthy();
    // §9a-2: the chain takes its state from services, which carry the real
    // Dec. 29 delivery.
    expect(screen.getAllByText(/delivered 2026-12-29/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/in transit/i)).toBeNull();
  });

  it("shows completeness as counts beside the year-end accounting status — coexisting, not conflated", async () => {
    const user = userEvent.setup();
    const { queries, ctx } = services();
    const chain = queries.getCommercialChains(ctx).find((c) => c.subjectRef === "SO-26184");
    renderRecon();
    await user.click(screen.getByRole("tab", { name: /Commercial Chain/ }));
    expect(
      screen.getByText(`${chain?.presentCount} of ${chain?.totalCount}`),
    ).toBeTruthy();
    expect(screen.getByText(/not a confidence score/)).toBeTruthy();
    expect(screen.getByText("YEAR-END ACCOUNTING STATUS")).toBeTruthy();
    expect(screen.getByText("Waiting on Contract")).toBeTruthy();
    // No percentage or score presentation of completeness.
    expect(screen.queryByText(/confidence/i, { selector: ".icg-chain-node-state" })).toBeNull();
  });

  it("lists every chain with required-missing named, including staged orders without exceptions", async () => {
    const user = userEvent.setup();
    const { queries, ctx } = services();
    const chains = queries.getCommercialChains(ctx);
    renderRecon();
    await user.click(screen.getByRole("tab", { name: /Commercial Chain/ }));
    const panel = screen.getByText("All commercial chains").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(chains.length - 1);
    // Legitimately incomplete staged orders say what is missing without an
    // exception attached.
    expect(
      within(panel as HTMLElement).getAllByText(/Missing required:/).length,
    ).toBeGreaterThan(0);
    expect(
      within(panel as HTMLElement).getAllByText("No close exception").length,
    ).toBeGreaterThan(0);
  });
});

describe("Reconciliation — serial integrity", () => {
  it("connects one serial to its book state, chain, and exceptions", () => {
    renderRecon("KE-E2-1048");
    expect(screen.getByText("NETSUITE LOCATION")).toBeTruthy();
    expect(screen.getByText("Primary Warehouse")).toBeTruthy();
    expect(screen.getByText("Customer site")).toBeTruthy();
    const jump = screen.getByRole("link", { name: /Financial Life/ });
    expect(jump.getAttribute("href")).toBe("/inventory/KE-E2-1048");
    expect(screen.getByText("REQUIRED EVIDENCE")).toBeTruthy();
    expect(screen.getAllByText(/EXC-001/).length).toBeGreaterThan(0);
  });

  it("verifies emptiness instead of assuming it for a clean serial", () => {
    const { queries, ctx } = services();
    // An on-book serial no exception references.
    const excSerials = new Set(
      queries
        .listExceptions(ctx)
        .flatMap((e) => e.exception.finding.subjects.serials ?? []),
    );
    const clean = queries
      .searchSerial(ctx, "KE-M1")
      .find((h) => h.onBook && !excSerials.has(h.serial));
    expect(clean).toBeDefined();
    renderRecon(clean?.serial ?? "");
    expect(screen.getByText(/verified empty, not assumed/)).toBeTruthy();
  });

  it("reports an unknown serial as a checked absence", () => {
    renderRecon("KE-Z9-0000");
    expect(screen.getByText(/No source in the dataset references KE-Z9-0000/)).toBeTruthy();
  });
});
