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
  it("carries its three tabs and opens on the financial bridge", () => {
    renderRecon();
    expect(screen.getByRole("tab", { name: /Financial/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Commercial Chain/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Serial Integrity/ })).toBeTruthy();
    expect(screen.getByText("CURRENT POSTED STATE")).toBeTruthy();
  });

  it("no longer hosts the three-way match, which moved to Procurement", () => {
    renderRecon();
    // Stage C: a buy-side control belongs with the other buy-side
    // populations. If it ever came back here it would exist twice, and two
    // copies of a match table is how two screens start disagreeing.
    expect(screen.queryByRole("tab", { name: /Procurement/ })).toBeNull();
    expect(screen.queryByText("All procurement matches")).toBeNull();
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
