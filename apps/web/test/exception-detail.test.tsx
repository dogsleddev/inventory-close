// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { ExceptionDetailScreen } from "../components/ExceptionDetailScreen";
import { buildExceptionDetailData, buildShellData } from "../lib/server/data";

/**
 * EXC-001 flagship acceptance (prompt 05): a first-time reviewer must see
 * within ~30 seconds that NetSuite and physical evidence conflict, required
 * accounting evidence is missing, and the conclusion remains open — plus
 * the two design §9a defect corrections pinned as regressions.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderDetail(
  role: Parameters<typeof userByRole>[0],
  id = "EXC-001",
) {
  const user = userByRole(role);
  return render(
    <ExceptionDetailScreen
      shell={buildShellData(user, "T-DETAIL")}
      data={buildExceptionDetailData(user, id, "T-DETAIL")}
      setRoleAction={noopRole}
    />,
  );
}

describe("EXC-001 — 30-second acceptance (three-layer reality)", () => {
  it("separates NetSuite / physical / accounting and keeps the conclusion open", () => {
    renderDetail("CONTROLLER");
    expect(screen.getByText("NETSUITE SAYS")).toBeTruthy();
    expect(screen.getByText("Primary Warehouse Inventory")).toBeTruthy();
    expect(screen.getByText("At Dec. 31, 2026 · not relieved")).toBeTruthy();
    expect(screen.getByText("PHYSICAL EVIDENCE SAYS")).toBeTruthy();
    expect(screen.getByText("Deployed to customer before year-end")).toBeTruthy();
    expect(screen.getAllByText("Dec. 27").length).toBeGreaterThan(0); // shipped
    expect(screen.getAllByText("Dec. 29").length).toBeGreaterThan(0); // delivered
    expect(screen.getByText("ACCOUNTING EVIDENCE SAYS")).toBeTruthy();
    expect(screen.getByText("Required provision missing")).toBeTruthy();
    expect(screen.getByText("MANAGEMENT CONCLUSION")).toBeTruthy();
    // Twice by design: the decision panel carries the conclusion as a record,
    // and the control-state trio repeats it beside the control evaluation and
    // the accounting evidence so the three are read together.
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getByText("Waiting on Contract")).toBeTruthy();
  });

  it("carries the exact EXC-001 facts from the services", () => {
    renderDetail("CONTROLLER");
    expect(screen.getAllByText(/SO-26184/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IF-261972/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/INV-2027-00418/).length).toBeGreaterThan(0);
    expect(screen.getByText("$14,800 · 2 × KE-E2")).toBeTruthy();
    expect(screen.getAllByText(/KE-E2-1048/).length).toBeGreaterThan(0);
  });

  it("holds the 'location is not ownership' distinction", () => {
    renderDetail("CONTROLLER");
    expect(screen.getByText("LOCATION IS NOT OWNERSHIP")).toBeTruthy();
    expect(screen.getByText(/They do not establish transfer of control/)).toBeTruthy();
  });

  it("shows both assertions from the finding", () => {
    renderDetail("CONTROLLER");
    expect(screen.getByText("ASSERTION · CUTOFF")).toBeTruthy();
    expect(screen.getByText("ASSERTION · RIGHTS & OBLIGATIONS")).toBeTruthy();
  });
});

describe("EXC-001 — transaction chain (completeness is never confidence)", () => {
  it("renders the service chain: 7 of 9 present, two required missing", () => {
    renderDetail("CONTROLLER");
    expect(
      screen.getByText(/7 of 9 components present — completeness is not a conclusion/),
    ).toBeTruthy();
    expect(screen.getByText(/Two missing components are required/)).toBeTruthy();
    expect(screen.getByText("CONTRACT (OWNERSHIP/ACCEPTANCE)")).toBeTruthy();
    expect(screen.getByText("INVENTORY RELIEF")).toBeTruthy();
    expect(
      screen.getByText("KE-E2-1048, KE-E2-1051 still on the year-end book"),
    ).toBeTruthy();
  });

  it("never renders the chain as a score, ratio bar, or percentage", () => {
    const { container } = renderDetail("CONTROLLER");
    const chainPanel = container.querySelector(".icg-chain")?.parentElement;
    expect(chainPanel?.textContent).not.toMatch(/%/);
    expect(chainPanel?.textContent).not.toMatch(/confidence/i);
  });

  it("design §9a defect 2 stays fixed: the carrier leg reads delivered, never in transit", () => {
    const { container } = renderDetail("CONTROLLER");
    expect(container.textContent).not.toMatch(/in transit/i);
    expect(screen.getAllByText(/delivered 2026-12-29/).length).toBeGreaterThan(0);
  });
});

describe("EXC-001 — evidence state and timeline", () => {
  it("groups Known / Conflicting / Missing without conflation", () => {
    renderDetail("CONTROLLER");
    expect(screen.getByText("KNOWN · 7")).toBeTruthy();
    expect(screen.getByText("CONFLICTING · 1")).toBeTruthy();
    expect(screen.getByText("MISSING · 1 — REQUIRED")).toBeTruthy();
    expect(
      screen.getByText(/Both facts are sourced and both cannot be true/),
    ).toBeTruthy();
  });

  it("holds the missing provision outside the chronology", () => {
    renderDetail("CONTROLLER");
    expect(
      screen.getByText(/Held outside the chronology so it cannot be read as an event/),
    ).toBeTruthy();
    // The chronology itself ends with the period-end conflict then invoice.
    expect(screen.getByText("NetSuite inventory = Primary Warehouse")).toBeTruthy();
  });

  it("announces the missing evidence as required to assistive tech", () => {
    renderDetail("CONTROLLER");
    expect(
      screen.getByLabelText(/Ownership\/acceptance contract provision — Missing, required/),
    ).toBeTruthy();
  });
});

describe("EXC-001 — evidence record drawer (occurred vs retrieved)", () => {
  it("design §9a defect 1 stays fixed: retrieval always follows occurrence", () => {
    const data = buildExceptionDetailData(userByRole("CONTROLLER"), "EXC-001", "T-EV");
    const records = Object.values(data.evidenceRecords ?? {});
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      const retrieved = record.rows.find((r) => r.k === "Retrieved");
      // Every fixture sync is the Jan. 7 post-period run — after every
      // occurrence. A retrieval stamped before its occurrence can never
      // reappear (the mockup's EV-4420 contradiction).
      expect(retrieved?.v).toBe("Jan. 7, 2027 06:00 UTC");
    }
  });

  it("opens the same record drawer from an evidence chip", async () => {
    const user = userEvent.setup();
    const { container } = renderDetail("CONTROLLER");
    const chip = container.querySelector(".icg-evchip");
    expect(chip).toBeTruthy();
    await user.click(chip as HTMLElement);
    expect(screen.getByText("EVIDENCE RECORD")).toBeTruthy();
    expect(screen.getByText("Identity transformation — original preserved")).toBeTruthy();
  });

  it("shows the rule execution truthfully (REVIEW_REQUIRED · COMPLETE)", () => {
    renderDetail("CONTROLLER");
    expect(screen.getByText("REVIEW_REQUIRED")).toBeTruthy();
    expect(screen.getByText("COMPLETE")).toBeTruthy();
    expect(screen.getByText("Missing required evidence never resolves to PASS.")).toBeTruthy();
  });
});

describe("Exception detail — roles and edge cases", () => {
  it("withholds restricted contract content from the preparer, visibly", () => {
    const data = buildExceptionDetailData(userByRole("PREPARER"), "EXC-001", "T-PREP");
    const contract = Object.values(data.evidenceRecords ?? {}).find(
      (r) => r.kind === "CONTRACT",
    );
    expect(contract?.contentWithheld).toBe(true);
  });

  it("scopes evidence records away from the auditor (provided support only)", () => {
    // EXC-009's workpaper (PBC-002 Inventory-to-GL Reconciliation) is
    // Preparing and has never been provided, so none of its support is in
    // the auditor's scope — the exception itself stays visible.
    const data = buildExceptionDetailData(
      userByRole("AUDITOR_READ_ONLY"),
      "EXC-009",
      "T-AUD",
    );
    expect(data.found).toBe(true);
    expect(Object.keys(data.evidenceRecords ?? {})).toHaveLength(0);
  });

  it("renders an honest absence for an unknown exception id", () => {
    renderDetail("CONTROLLER", "EXC-999");
    expect(screen.getByText("No such exception")).toBeTruthy();
    expect(screen.getByText(/EXC-999 is not in the FY2026 close population/)).toBeTruthy();
  });

  it("renders the standardized layout for a resolved exception too", () => {
    renderDetail("CONTROLLER", "EXC-009");
    expect(screen.getAllByText("Resolved — Adjustment Proposed").length).toBeGreaterThan(0);
    expect(screen.getByText("Adjustment proposed — not posted")).toBeTruthy();
    expect(screen.getAllByText("$2,900").length).toBeGreaterThan(0);
  });
});
