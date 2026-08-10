// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { ExceptionDetailScreen } from "../components/ExceptionDetailScreen";
import { ExceptionsScreen } from "../components/ExceptionsScreen";
import {
  buildExceptionDetailData,
  buildExceptionsData,
  buildShellData,
} from "../lib/server/data";

/**
 * The interaction rules in §4 and the accessibility requirements in §7 are
 * build requirements, not suggestions, and every one of them here was found
 * unguarded by the stage-05 fleet review: Audit Details remembering its state
 * between objects, drawers that never returned focus, and restricted screens
 * no test had ever rendered.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderDetail(role: Parameters<typeof userByRole>[0] = "CONTROLLER", id = "EXC-001") {
  const user = userByRole(role);
  return render(
    <ExceptionDetailScreen
      shell={buildShellData(user, "T-INT")}
      data={buildExceptionDetailData(user, id, "T-INT")}
      setRoleAction={noopRole}
    />,
  );
}

function renderQueue(role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <ExceptionsScreen
      shell={buildShellData(user, "T-INT")}
      data={buildExceptionsData(user, "T-INT")}
      setRoleAction={noopRole}
    />,
  );
}

const auditToggle = () => screen.getByRole("button", { name: /Audit Details/ });

describe("§4 Audit Details — collapsed by default, never remembered", () => {
  it("starts collapsed on the exception detail", () => {
    renderDetail();
    expect(auditToggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Output hash")).toBeNull();
  });

  it("expands on demand and shows the run provenance", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(auditToggle());
    expect(auditToggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Object ID")).toBeTruthy();
    expect(screen.getByText("Output hash")).toBeTruthy();
  });

  it("returns to collapsed when the drawer swaps to another record", async () => {
    const user = userEvent.setup();
    const { container } = renderDetail();
    const chips = container.querySelectorAll(".icg-evchip");
    expect(chips.length).toBeGreaterThan(1);

    await user.click(chips[0] as HTMLElement);
    const drawer = () => screen.getByRole("complementary", { name: /Evidence record/ });
    const drawerToggle = () => within(drawer()).getByRole("button", { name: /Audit Details/ });
    await user.click(drawerToggle());
    expect(drawerToggle().getAttribute("aria-expanded")).toBe("true");
    const firstLabel = drawer().getAttribute("aria-label");

    await user.click(chips[1] as HTMLElement);
    expect(drawer().getAttribute("aria-label")).not.toBe(firstLabel);
    expect(drawerToggle().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("§7 drawer focus — heading, Escape, and return to the source row", () => {
  it("moves focus into the drawer and hands it back on Escape", async () => {
    const user = userEvent.setup();
    renderQueue();
    const opener = screen.getByRole("button", { name: "Open EXC-001 summary" });
    opener.focus();
    await user.keyboard("{Enter}");

    const drawer = screen.getByRole("complementary", { name: "EXC-001 summary" });
    expect(drawer.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "EXC-001 summary" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside the drawer instead of leaking into the page behind it", async () => {
    const user = userEvent.setup();
    renderQueue();
    await user.click(screen.getByRole("button", { name: "Open EXC-001 summary" }));
    const drawer = screen.getByRole("complementary", { name: "EXC-001 summary" });

    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(
        drawer.contains(document.activeElement),
        `focus escaped the drawer on tab ${i + 1}`,
      ).toBe(true);
    }
  });
});

describe("restricted screens render a restriction, never an empty screen", () => {
  it("the exceptions queue says so to a role without close.read", () => {
    renderQueue("SYSTEM_ADMIN");
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.getByText(/No figure is shown — not a zero/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("the exception detail says so too", () => {
    renderDetail("SYSTEM_ADMIN");
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.queryByText("NETSUITE SAYS")).toBeNull();
  });

  // EXC-009 sits under PBC-002, which is Preparing — no version of it has
  // ever been provided, so its support is outside the auditor's scope.
  // (EXC-001 is IN scope since stage 07 corrected the PBC baseline: PBC-008
  // is Follow-Up Requested, which means it was provided and more was asked.)
  it("an auditor is told the evidence is out of scope rather than shown nothing", () => {
    const data = buildExceptionDetailData(userByRole("AUDITOR_READ_ONLY"), "EXC-009", "T-INT");
    expect(data.found).toBe(true);
    expect(Object.keys(data.evidenceRecords ?? {})).toHaveLength(0);
    expect(data.evidenceState?.scopeNotice).toContain("outside your scope");
    expect(data.timeline?.scopeNotice).toContain("outside your scope");
    // A conflict claim about evidence the viewer cannot see is not asserted.
    expect(data.evidenceState?.conflicting).toHaveLength(0);
    expect(data.timeline?.entries).toHaveLength(0);

    renderDetail("AUDITOR_READ_ONLY", "EXC-009");
    expect(screen.getAllByText("Outside your scope").length).toBeGreaterThan(0);
  });

  it("an in-scope exception still withholds restricted content from the auditor", () => {
    const data = buildExceptionDetailData(userByRole("AUDITOR_READ_ONLY"), "EXC-001", "T-INT");
    expect(data.found).toBe(true);
    // Provided support reaches them; scope is not a substitute for the
    // sensitivity gate, and the contract stays withheld.
    expect(Object.keys(data.evidenceRecords ?? {}).length).toBeGreaterThan(0);
    expect(data.evidenceState?.scopeNotice).toBeNull();
    const contract = Object.values(data.evidenceRecords ?? {}).find(
      (r) => r.kind === "CONTRACT",
    );
    if (contract !== undefined) expect(contract.contentWithheld).toBe(true);
  });

  it("the controller's evidence sections carry no scope notice", () => {
    const data = buildExceptionDetailData(userByRole("CONTROLLER"), "EXC-001", "T-INT");
    expect(data.evidenceState?.scopeNotice).toBeNull();
    expect(data.timeline?.scopeNotice).toBeNull();
    expect(data.evidenceState?.conflicting.length).toBeGreaterThan(0);
  });
});
