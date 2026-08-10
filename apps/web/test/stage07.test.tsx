// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { AdjustmentsScreen } from "../components/AdjustmentsScreen";
import { AuditPackageScreen } from "../components/AuditPackageScreen";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { ValuationScreen } from "../components/ValuationScreen";
import { buildAdjustmentsData } from "../lib/server/adjustments-view";
import { buildAuditPackageData } from "../lib/server/audit-package-view";
import { buildPackageManifest } from "../lib/server/integrity-view";
import { buildShellData } from "../lib/server/data";
import { buildReconciliationData } from "../lib/server/recon-view";
import { buildValuationData } from "../lib/server/valuation-view";
import { getQueries, makeContext } from "../lib/server/workspace";
import { formatCents } from "../lib/format";

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
type Role = Parameters<typeof userByRole>[0];

function services(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return { user, queries: getQueries(), ctx: makeContext(user, "T-07") };
}

function renderRecon(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <ReconciliationScreen
      shell={buildShellData(user, "T-07")}
      data={buildReconciliationData(user, "", "T-07")}
      setRoleAction={noopRole}
    />,
  );
}

function renderAdjustments(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <AdjustmentsScreen
      shell={buildShellData(user, "T-07")}
      data={buildAdjustmentsData(user, "T-07")}
      setRoleAction={noopRole}
    />,
  );
}

function renderValuation(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <ValuationScreen
      shell={buildShellData(user, "T-07")}
      data={buildValuationData(user, "T-07")}
      setRoleAction={noopRole}
    />,
  );
}

function renderPackage(role: Role = "CONTROLLER", pbc = "") {
  const user = userByRole(role);
  return render(
    <AuditPackageScreen
      shell={buildShellData(user, "T-07")}
      data={buildAuditPackageData(user, pbc, "T-07")}
      manifest={buildPackageManifest(user, "T-07")}
      reproduceAction={async () => {
        throw new Error("not used in this test");
      }}
      setRoleAction={noopRole}
    />,
  );
}

describe("Financial bridge", () => {
  it("renders every bridge figure from the service, not from the component", () => {
    const { queries, ctx } = services();
    const recon = queries.getReconciliation(ctx);
    renderRecon();
    for (const value of [
      recon.subledgerCents,
      recon.grossGlCents,
      recon.differenceCents,
      recon.potentialAdjustedGlCents,
    ]) {
      expect(
        screen.getAllByText(formatCents(value)).length,
        `${formatCents(value)} missing`,
      ).toBeGreaterThan(0);
    }
    // The bridge clears to zero only as a hypothetical — stated on both the
    // potential-state panel and the bridge's own total row.
    expect(screen.getAllByText("Potential adjusted difference")).toHaveLength(2);
    expect(screen.getAllByText("HYPOTHETICAL")).toHaveLength(1);
  });

  it("separates the posted state from the potential state in words", () => {
    renderRecon();
    expect(screen.getByText("CURRENT POSTED STATE")).toBeTruthy();
    expect(screen.getByText("POTENTIAL ADJUSTED STATE")).toBeTruthy();
    expect(screen.getByText(/Nothing on this page has been posted to NetSuite/)).toBeTruthy();
  });

  it("tags every reconciling item NOT POSTED", () => {
    const { queries, ctx } = services();
    const recon = queries.getReconciliation(ctx);
    renderRecon();
    expect(screen.getAllByText("NOT POSTED")).toHaveLength(recon.items.length);
  });

  it("states why the adjusted outcome is unreachable, counted from close state", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    const open = register.entries.filter((e) => e.exceptionOpen).length;
    renderRecon();
    // The mockup asserted "2 items open"; the data says one. Copy follows
    // the data (a third §9a-class defect, corrected rather than replicated).
    expect(
      screen.getByText(new RegExp(`Not reachable — ${open} exception`)),
    ).toBeTruthy();
  });

  it("holds reserves out of the gross bridge", () => {
    renderRecon();
    expect(screen.getByText(/All figures on this tab are gross/)).toBeTruthy();
  });
});

describe("Adjustments register", () => {
  it("marks every proposal NOT POSTED and unapproved", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    renderAdjustments();
    expect(screen.getAllByText("NOT POSTED")).toHaveLength(register.identifiedCount);
    expect(screen.getAllByText("Not approved")).toHaveLength(register.draftedCount);
    // The posted count is a rendered zero, and no entry carries a JE reference.
    const posted = screen.getByText("Posted").closest(".icg-kpi");
    expect(within(posted as HTMLElement).getByText("0")).toBeTruthy();
    expect(screen.queryByText(/Posted to NetSuite|JE reference/i)).toBeNull();
  });

  it("shows balanced debit and credit lines for each drafted entry", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    renderAdjustments();
    expect(screen.getAllByText("Balanced — debits equal credits")).toHaveLength(
      register.draftedCount,
    );
    expect(screen.getAllByText("DEBIT").length).toBe(register.draftedCount);
    expect(screen.getAllByText("CREDIT").length).toBe(register.draftedCount);
  });

  it("separates preparer from reviewer on every entry", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    renderAdjustments();
    // Scoped to the register: the shell header also names the acting role.
    const panel = screen.getByText("Proposal register").closest("section") as HTMLElement;
    expect(within(panel).getAllByText("Accounting Manager")).toHaveLength(
      register.draftedCount,
    );
    expect(within(panel).getAllByText("Controller")).toHaveLength(register.draftedCount);
  });

  it("says an identified item has no drafted entry rather than omitting it", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    const undrafted = register.entries.filter((e) => e.proposal === undefined);
    expect(undrafted.length).toBeGreaterThan(0);
    renderAdjustments();
    expect(screen.getAllByText("No entry drafted")).toHaveLength(undrafted.length);
    for (const entry of undrafted) {
      expect(screen.getAllByText(new RegExp(entry.exceptionId)).length).toBeGreaterThan(0);
    }
  });

  it("tells a role without close access, rather than showing an empty register", () => {
    renderAdjustments("SYSTEM_ADMIN");
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.queryByText("Proposal register")).toBeNull();
  });
});

describe("Valuation", () => {
  it("keeps the reserve conclusion UNDETERMINED with no proposed amount", () => {
    renderValuation();
    expect(screen.getByText("UNDETERMINED")).toBeTruthy();
    expect(
      screen.getByText(/No reserve amount is proposed by any rule, model, or assistant/),
    ).toBeTruthy();
    // There is no control that would record one.
    expect(screen.queryByRole("button", { name: /reserve/i })).toBeNull();
  });

  it("reports the recorded 1290 balance as a recorded balance, not a conclusion", () => {
    const { queries, ctx } = services();
    const valuation = queries.getValuation(ctx);
    renderValuation();
    expect(
      screen.getAllByText(formatCents(valuation.reserve.recordedCents)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/not this period's conclusion/)).toBeTruthy();
  });

  it("buckets aging from the service and flags the slow-moving band", () => {
    const { queries, ctx } = services();
    const valuation = queries.getValuation(ctx);
    renderValuation();
    for (const bucket of valuation.aging) {
      expect(screen.getAllByText(bucket.label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Slow-moving by policy").length).toBeGreaterThan(0);
  });

  it("describes each population as a review, never as a write-down", () => {
    renderValuation();
    expect(screen.getByText(/None of them is a write-down/)).toBeTruthy();
    expect(screen.queryByText(/write.?off/i)).toBeNull();
  });
});

describe("Audit Package", () => {
  it("features exactly the four specified attention items", async () => {
    renderPackage();
    const panel = screen.getByText("Requires attention").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]?.textContent)).toEqual([
      "PBC-002",
      "PBC-005",
      "PBC-008",
      "PBC-018",
    ]);
    expect(within(panel as HTMLElement).getAllByText("Preparing")).toHaveLength(2);
    expect(within(panel as HTMLElement).getAllByText("Follow-Up Requested")).toHaveLength(1);
    expect(within(panel as HTMLElement).getAllByText("Not Started")).toHaveLength(1);
    await Promise.resolve();
  });

  it("renders readiness from the service with the state breakdown", () => {
    const { queries, ctx } = services();
    const aggregates = queries.getCloseReadiness(ctx).aggregates;
    renderPackage();
    expect(
      screen.getByText(
        `${aggregates.pbcReady} of ${aggregates.pbcTotal} Ready or Provided`,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/says nothing about whether the auditor has accepted/)).toBeTruthy();
  });

  it("never uses acceptance language anywhere on the screen", () => {
    renderPackage();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Auditor Approved/i);
    expect(text).not.toMatch(/Accepted by/i);
    expect(text).toMatch(/no state in this system that records auditor acceptance/i);
  });

  it("shows a sealed version history where only the working draft is editable", async () => {
    const user = userEvent.setup();
    renderPackage("CONTROLLER", "PBC-008");
    await user.click(screen.getByRole("tab", { name: /Version History/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).getAllByText("SEALED").length).toBeGreaterThan(1);
    expect(within(panel).getAllByText("EDITABLE")).toHaveLength(1);
    expect(within(panel).getByText("Superseded")).toBeTruthy();
    expect(
      within(panel).getByText(/can only be superseded, never edited/),
    ).toBeTruthy();
  });

  it("traces a lineage path that ends in an absence when there is one", async () => {
    const user = userEvent.setup();
    renderPackage("CONTROLLER", "PBC-008");
    await user.click(screen.getByRole("tab", { name: /Workpaper/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).getByText("PBC REQUEST")).toBeTruthy();
    expect(within(panel).getByText("CLOSE EXCEPTION")).toBeTruthy();
    expect(within(panel).getByText("SOURCE RECORD")).toBeTruthy();
    expect(within(panel).getByText(/terminates at no record/)).toBeTruthy();
  });

  it("tells the auditor a workpaper is out of scope rather than showing it empty", async () => {
    const user = userEvent.setup();
    // PBC-002 has never been provided, so its support is outside the scope.
    renderPackage("AUDITOR_READ_ONLY", "PBC-002");
    expect(screen.getByText("Auditor view — read only")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /Evidence/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).getByText("Outside your scope")).toBeTruthy();
    expect(within(panel).getByText(/This is not an empty workpaper/)).toBeTruthy();
  });

  it("gives the auditor the support behind a workpaper that was provided", async () => {
    const user = userEvent.setup();
    renderPackage("AUDITOR_READ_ONLY", "PBC-008");
    await user.click(screen.getByRole("tab", { name: /Evidence/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).queryByText("Outside your scope")).toBeNull();
    expect(within(panel).getAllByText(/ATTACHED|MISSING/).length).toBeGreaterThan(0);
  });
});
