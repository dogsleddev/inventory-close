// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { buildShellData } from "../lib/server/data";
import { buildAdjustmentsData } from "../lib/server/adjustments-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { getQueries, makeContext } from "../lib/server/workspace";
import { concludeException, controller, resetDemo } from "./support/live-close";

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

/**
 * Sentences, not stale badges.
 *
 * With the exception list bound to `listExceptions`, concluding EXC-015 left
 * /reconciliation's financial bridge showing that row as 'Controller Review',
 * ember true, detail "No entry drafted — EXC-015 has not reached a management
 * conclusion.", and the total row as "Not reachable — 1 exception open, 1 with
 * no entry drafted". /adjustments showed the same card plus the KPI note "1
 * awaiting a management conclusion". Meanwhile /exceptions/EXC-015 said
 * "Management concluded the item is supported and no adjustment is required."
 *
 * /reconciliation is step 1 of the user guide's third journey
 * (UserGuideScreen.tsx:106-111), so this is on a path the demo walks.
 *
 * `undraftedReason` and `exceptionOpen` are baked into the register by
 * @icg/rules and cannot be changed there — the rules are reporting what was
 * true when the close ran. The overlay is at the view layer.
 */
describe("Reconciliation and Adjustments report the conclusion the product is holding", () => {
  afterEach(resetDemo);

  const bridgeRows = () =>
    buildReconciliationData(controller(), "", "T-REC-LIVE").financial?.bridge.rows ?? [];
  const rowFor = (id: string) => bridgeRows().find((r) => r.id === id);
  const totalRow = () => bridgeRows().find((r) => r.kind === "total");
  const draftedNote = (data: ReturnType<typeof buildAdjustmentsData>) =>
    data.stats.find((s) => s.label === "Entries drafted")?.note ?? "";

  it("says all five of these before anyone concludes", () => {
    const row = rowFor("EXC-015");
    expect(row?.status?.label).toBe("Controller Review");
    expect(row?.ember).toBe(true);
    expect(row?.detail).toMatch(/has not reached a management conclusion/);
    expect(totalRow()?.detail).toMatch(/1 exception open/);
    expect(draftedNote(buildAdjustmentsData(controller(), "T-ADJ-BEFORE"))).toMatch(/1 awaiting/);
  });

  it("says none of them once the Controller has concluded EXC-015", () => {
    concludeException("EXC-015");

    const row = rowFor("EXC-015");
    expect(row?.status?.label).toBe("Resolved — No Adjustment");
    expect(row?.ember).toBe(false);
    expect(row?.detail).not.toMatch(/has not reached a management conclusion/);

    const total = totalRow();
    expect(total?.detail).not.toMatch(/1 exception open/);
    expect(total?.detail).not.toMatch(/exceptions? open/);
    // The other half of that sentence is still TRUE and must survive: the item
    // genuinely has no drafted entry. Only the claim about the conclusion was
    // false, and only that claim is removed.
    expect(total?.detail).toMatch(/1 with no entry drafted/);

    expect(draftedNote(buildAdjustmentsData(controller(), "T-ADJ-AFTER"))).not.toMatch(/1 awaiting/);
  });

  it("matches the /adjustments card to the drawer it opens", () => {
    concludeException("EXC-015");
    const data = buildAdjustmentsData(controller(), "T-ADJ-CARD");
    const card = data.cards.find((c) => c.exceptionId === "EXC-015");

    expect(card?.status?.label).toBe("Resolved — No Adjustment");
    expect(card?.ember).toBe(false);
    expect(card?.detail).not.toMatch(/has not reached a management conclusion/);
    expect(card?.undraftedReason).not.toMatch(/has not reached a management conclusion/);
    // It still says no entry was drafted, because none was.
    expect(card?.undraftedReason).toMatch(/No entry drafted/);

    const drawer = card?.drawerId !== null ? data.drawers[card?.drawerId ?? ""] : undefined;
    expect(drawer?.status.label).toBe(card?.status?.label);
    expect(drawer?.blocker).toBe(false);
  });
});
