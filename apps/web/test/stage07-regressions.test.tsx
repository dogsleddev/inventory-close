// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { AdjustmentsScreen } from "../components/AdjustmentsScreen";
import { AuditPackageScreen } from "../components/AuditPackageScreen";
import { ExceptionsScreen } from "../components/ExceptionsScreen";
import { InventorySearchScreen } from "../components/InventorySearchScreen";
import { OverviewScreen } from "../components/OverviewScreen";
import { PhysicalCountScreen } from "../components/PhysicalCountScreen";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { ValuationScreen } from "../components/ValuationScreen";
import { buildAdjustmentsData } from "../lib/server/adjustments-view";
import { buildAuditPackageData } from "../lib/server/audit-package-view";
import { buildPhysicalCountData } from "../lib/server/count-view";
import { buildExceptionsData, buildOverviewData, buildShellData } from "../lib/server/data";
import { buildInventorySearchData } from "../lib/server/financial-life-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { buildValuationData } from "../lib/server/valuation-view";
import { getQueries, makeContext } from "../lib/server/workspace";

/**
 * Stage 07 fleet-review regressions.
 *
 * One theme runs through every confirmed defect: a sentence that names a fact
 * was gated on a PROXY for that fact — an empty list standing in for "not
 * provided", a location standing in for "assessment outstanding". These pin
 * the fact, not the proxy.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
type Role = Parameters<typeof userByRole>[0];

function services(role: Role = "CONTROLLER") {
  const user = userByRole(role);
  return { user, queries: getQueries(), ctx: makeContext(user, "T-07R") };
}

function pkg(role: Role, id = "") {
  return buildAuditPackageData(userByRole(role), id, "T-07R");
}

function renderPackage(role: Role, id = "") {
  const user = userByRole(role);
  return render(
    <AuditPackageScreen
      shell={buildShellData(user, "T-07R")}
      data={buildAuditPackageData(user, id, "T-07R")}
      setRoleAction={noopRole}
    />,
  );
}

describe("a scope notice is gated on provision, never on an empty list", () => {
  const ALL_PBC = Array.from({ length: 21 }, (_, i) => `PBC-${String(i + 1).padStart(3, "0")}`);

  it("never tells an auditor a sealed, provided workpaper was not provided", () => {
    for (const id of ALL_PBC) {
      const data = pkg("AUDITOR_READ_ONLY", id);
      const detail = data.detail;
      expect(detail, `${id} has no detail`).not.toBeNull();
      const row = data.rows.find((r) => r.id === id);
      expect(row, `${id} missing from rows`).toBeDefined();
      const provided = row!.versions !== "None provided";
      if (provided) {
        expect(
          detail!.evidence.scopeNotice,
          `${id} is provided but its Evidence tab claims otherwise`,
        ).toBeNull();
      }
    }
  });

  it("still emits the notice for a workpaper that genuinely has not been provided", () => {
    // PBC-002 is Preparing: nothing sealed, and its evidence is out of scope.
    // The fix must not be implementable by deleting the notice.
    const detail = pkg("AUDITOR_READ_ONLY", "PBC-002").detail;
    expect(detail?.evidence.scopeNotice).toContain("has not been provided");
  });

  it("falls through to the honest empty state for a provided workpaper with no exception dependency", async () => {
    const user = userEvent.setup();
    // PBC-001 depends on POPULATION, so it has no evidence rows for ANY role.
    renderPackage("AUDITOR_READ_ONLY", "PBC-001");
    await user.click(screen.getByRole("tab", { name: /Evidence/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).queryByText(/has not been provided/)).toBeNull();
    expect(within(panel).getByText(/No evidence is linked/)).toBeTruthy();
  });
});

describe("a path truncated by scope says so", () => {
  it("never renders a withheld lineage under the claim that it traces end to end", () => {
    for (const row of pkg("CONTROLLER").rows) {
      const auditor = pkg("AUDITOR_READ_ONLY", row.id).detail;
      expect(auditor).not.toBeNull();
      // Structural pin: related exceptions but a one-node chain means the
      // rest was withheld, and that must be disclosed.
      if (auditor!.related.length > 0 && auditor!.workpaper.lineage.length === 1) {
        expect(
          auditor!.workpaper.scopeNotice,
          `${row.id} withheld its lineage silently`,
        ).not.toBeNull();
      }
    }
  });

  it("suppresses the traces-to-a-source-record claim when the path is withheld", async () => {
    const user = userEvent.setup();
    // PBC-018 -> EXC-011, which is outside auditor scope.
    const detail = pkg("AUDITOR_READ_ONLY", "PBC-018").detail;
    expect(detail?.workpaper.scopeNotice).not.toBeNull();
    renderPackage("AUDITOR_READ_ONLY", "PBC-018");
    await user.click(screen.getByRole("tab", { name: /Workpaper/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).getByText("Outside your scope")).toBeTruthy();
    expect(
      within(panel).queryByText(/Every figure in this workpaper traces to a source record/),
    ).toBeNull();
  });

  it("keeps the full chain and the terminating absence for the controller", async () => {
    const user = userEvent.setup();
    const detail = pkg("CONTROLLER", "PBC-018").detail;
    expect(detail?.workpaper.scopeNotice).toBeNull();
    expect(detail!.workpaper.lineage.length).toBeGreaterThan(1);
    renderPackage("CONTROLLER", "PBC-018");
    await user.click(screen.getByRole("tab", { name: /Workpaper/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).getByText("CLOSE EXCEPTION")).toBeTruthy();
    expect(within(panel).getByText(/terminates at no record/)).toBeTruthy();
  });
});

describe("an internal draft is not provided support", () => {
  it("withholds unsealed drafts from the auditor and says how many", () => {
    const { queries, ctx } = services("AUDITOR_READ_ONLY");
    for (const item of queries.getPbcPackage(ctx)) {
      for (const v of item.versions) {
        expect(v.sealed, `${item.id} handed the auditor an unsealed draft`).toBe(true);
      }
    }
    // PBC-002 is Preparing: its only version is a working draft.
    const detail = pkg("AUDITOR_READ_ONLY", "PBC-002").detail;
    expect(detail?.versions.rows).toHaveLength(0);
    expect(detail?.versions.scopeNotice).toContain("withheld");
  });

  it("gives the controller the drafts, and never claims a history is empty when it is withheld", async () => {
    const user = userEvent.setup();
    const controller = pkg("CONTROLLER", "PBC-002").detail;
    expect(controller?.versions.rows.length).toBeGreaterThan(0);
    expect(controller?.versions.scopeNotice).toBeNull();

    renderPackage("AUDITOR_READ_ONLY", "PBC-002");
    await user.click(screen.getByRole("tab", { name: /Version History/ }));
    const panel = document.getElementById("icg-pbc-panel") as HTMLElement;
    expect(within(panel).queryByText(/preparation has not started/)).toBeNull();
    expect(within(panel).getByText("Outside your scope")).toBeTruthy();
  });

  it("describes what is actually scoped in the auditor banner", () => {
    const note = pkg("AUDITOR_READ_ONLY").auditorNote ?? "";
    // Every request IS listed, so the banner must not imply otherwise.
    expect(pkg("AUDITOR_READ_ONLY").rows).toHaveLength(21);
    expect(note).toMatch(/Every request is listed/);
    expect(note).toMatch(/internal drafts/);
  });
});

describe("the bridge does not call an identified item a proposal", () => {
  it("never claims more drafted entries than exist", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    const financial = buildReconciliationData(userByRole("CONTROLLER"), "", "T-07R").financial;
    expect(financial).not.toBeNull();
    const prose = [
      financial!.direction,
      financial!.potential.footnote,
      ...financial!.bridge.rows.map((r) => r.detail),
    ].join(" ");
    // The identified count exceeds the drafted count at this baseline, so any
    // sentence that calls all of them proposals overstates what exists.
    expect(register.identifiedCount).toBeGreaterThan(register.draftedCount);
    expect(prose).not.toMatch(/\bproposals?\b/i);
    expect(financial!.potential.footnote).toMatch(
      new RegExp(`Only ${register.draftedCount} of the ${register.identifiedCount}`),
    );
  });

  it("conditions the adjusted outcome on every identified item, not on the entries drafted", () => {
    const financial = buildReconciliationData(userByRole("CONTROLLER"), "", "T-07R").financial;
    expect(financial!.potential.footnote).toMatch(/all 3 items identified here were adjusted/);
  });
});

describe("the damaged panel asserts no assessment state it did not read", () => {
  it("reports each unit's own assessment rather than one claim over the population", () => {
    const { queries, ctx } = services();
    const valuation = queries.getValuation(ctx);
    const data = buildValuationData(userByRole("CONTROLLER"), "T-07R");
    expect(data.damaged.rows).toHaveLength(valuation.damaged.length);
    // The population is selected by location, so most units have no exception
    // and therefore no assessment to report.
    expect(data.damaged.rows.some((r) => r.assessment === null)).toBe(true);
    for (const row of data.damaged.rows) {
      if (row.assessment === null) {
        expect(row.assessmentNote).toBe("No assessment on file");
      }
    }
  });

  it("never says an assessment is pending for a unit whose assessment concluded", () => {
    const data = buildValuationData(userByRole("CONTROLLER"), "T-07R");
    const resolved = data.damaged.rows.filter((r) =>
      r.assessment !== null && r.assessment.label.startsWith("Resolved"),
    );
    expect(resolved.length).toBeGreaterThan(0);
    render(
      <ValuationScreen
        shell={buildShellData(userByRole("CONTROLLER"), "T-07R")}
        data={data}
        setRoleAction={noopRole}
      />,
    );
    const panel = screen.getByText("Damaged and returned units").closest("section") as HTMLElement;
    expect(within(panel).queryByText(/pending a repair-versus-write-down assessment/)).toBeNull();
    for (const row of resolved) {
      const cell = within(panel).getByText(row.serial).closest("tr") as HTMLElement;
      expect(within(cell).getByText(/Resolved/)).toBeTruthy();
    }
  });
});

describe("row activation is wired the same way on every screen that claims it", () => {
  // jsdom computes no layout, so the overlay cannot be measured. Pin the
  // structure instead: `.icg-row-btn::after` is absolutely positioned and
  // must resolve against `.icg-table tr`, so the cell must NOT be positioned,
  // and the ID link needs `icg-row-link` to sit above the overlay.
  const screens: readonly [string, () => void][] = [
    ["Overview", () => {
      const u = userByRole("CONTROLLER");
      render(<OverviewScreen shell={buildShellData(u, "T-07R")} data={buildOverviewData(u, "T-07R")} setRoleAction={noopRole} />);
    }],
    ["Exceptions", () => {
      const u = userByRole("CONTROLLER");
      render(<ExceptionsScreen shell={buildShellData(u, "T-07R")} data={buildExceptionsData(u, "T-07R")} setRoleAction={noopRole} />);
    }],
    ["Inventory", () => {
      const u = userByRole("CONTROLLER");
      render(<InventorySearchScreen shell={buildShellData(u, "T-07R")} data={buildInventorySearchData(u, "KE-", "T-07R")} setRoleAction={noopRole} />);
    }],
    ["Physical Count", () => {
      const u = userByRole("CONTROLLER");
      render(<PhysicalCountScreen shell={buildShellData(u, "T-07R")} data={buildPhysicalCountData(u, "T-07R")} setRoleAction={noopRole} />);
    }],
    ["Reconciliation", () => {
      const u = userByRole("CONTROLLER");
      render(<ReconciliationScreen shell={buildShellData(u, "T-07R")} data={buildReconciliationData(u, "", "T-07R")} setRoleAction={noopRole} />);
    }],
    ["Valuation", () => {
      const u = userByRole("CONTROLLER");
      render(<ValuationScreen shell={buildShellData(u, "T-07R")} data={buildValuationData(u, "T-07R")} setRoleAction={noopRole} />);
    }],
    ["Adjustments", () => {
      const u = userByRole("CONTROLLER");
      render(<AdjustmentsScreen shell={buildShellData(u, "T-07R")} data={buildAdjustmentsData(u, "T-07R")} setRoleAction={noopRole} />);
    }],
  ];

  it.each(screens)("%s pairs every row overlay with a lifted ID link", (_name, mount) => {
    mount();
    const overlays = Array.from(document.querySelectorAll(".icg-row-btn"));
    for (const overlay of overlays) {
      const cell = overlay.closest("td");
      if (cell === null) continue;
      // A positioned cell would shrink the overlay to this one cell.
      expect(
        (cell as HTMLElement).style.position,
        "the ID cell must not be a containing block",
      ).toBe("");
      const link = cell.querySelector("a");
      if (link !== null) {
        expect(
          link.className,
          "an ID link under a row overlay needs icg-row-link",
        ).toContain("icg-row-link");
      }
    }
  });
});

describe("the responsive contract covers every grid it introduces", () => {
  it("gives each 4+ column KPI grid a 1280-1439 rule", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");
    const block = /@media \(min-width: 1280px\) and \(max-width: 1439px\) \{([\s\S]*?)\n\}/.exec(css);
    expect(block, "the 1280-1439 breakpoint block is missing").not.toBeNull();
    const wide = [...css.matchAll(/\.(icg-kpis[\w-]*)\s*\{[^}]*grid-template-columns:\s*repeat\((\d+)/g)]
      .filter((m) => Number(m[2]) >= 4)
      .map((m) => m[1]);
    expect(wide.length).toBeGreaterThan(0);
    for (const selector of wide) {
      expect(block![1], `.${selector} has no 1280-1439 rule`).toContain(`.${selector}`);
    }
  });
});
