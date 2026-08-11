// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole, DEMO_USERS } from "@icg/data";
import { AdjustmentsScreen } from "../components/AdjustmentsScreen";
import { AuditPackageScreen } from "../components/AuditPackageScreen";
import { CostingScreen } from "../components/CostingScreen";
import { EvidenceScreen } from "../components/EvidenceScreen";
import { ExceptionsScreen } from "../components/ExceptionsScreen";
import { InventorySearchScreen } from "../components/InventorySearchScreen";
import { OverviewScreen } from "../components/OverviewScreen";
import { PhysicalCountScreen } from "../components/PhysicalCountScreen";
import { ProcurementScreen } from "../components/ProcurementScreen";
import { ReconciliationScreen } from "../components/ReconciliationScreen";
import { ValuationScreen } from "../components/ValuationScreen";
import { EXPORT_TABLES, buildCsv } from "../lib/server/export-csv";
import { NAV_SECTIONS } from "../lib/nav";
import { getQueries, makeContext } from "../lib/server/workspace";
import { buildAdjustmentsData } from "../lib/server/adjustments-view";
import { buildAuditPackageData } from "../lib/server/audit-package-view";
import { buildCostingData } from "../lib/server/costing-view";
import { buildPhysicalCountData } from "../lib/server/count-view";
import {
  buildExceptionsData,
  buildOverviewData,
  buildShellData,
} from "../lib/server/data";
import { buildEvidenceData } from "../lib/server/evidence-view";
import { buildPackageManifest } from "../lib/server/integrity-view";
import { buildInventorySearchData } from "../lib/server/financial-life-view";
import { buildInventoryListData } from "../lib/server/inventory-list-view";
import { buildProcurementData } from "../lib/server/procurement-view";
import { buildReconciliationData } from "../lib/server/recon-view";
import { buildValuationData } from "../lib/server/valuation-view";

/**
 * The way out of the product.
 *
 * The export route handlers shipped in Stage B and nothing linked to them for
 * two stages: no screen rendered a control, and the word CSV appeared nowhere
 * in `apps/web`. A capability with no affordance is one the user does not
 * have, and the release gate recorded "nothing can leave the app" as a P0 on
 * that basis.
 *
 * These tests pin the three things that make the affordance honest rather
 * than merely present: it appears wherever a population can leave, it never
 * appears where the viewer would be refused the file, and where the file is
 * broader than the view it says so.
 */

afterEach(cleanup);
const noopRole = vi.fn(async () => {});
const noopReproduce = vi.fn(async () => ({}) as never);
const user = (role: Parameters<typeof userByRole>[0] = "CONTROLLER") => userByRole(role);

/** Every screen that owns a population, with how to render it. */
const SCREENS = [
  {
    route: "/",
    table: "close-summary",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <OverviewScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildOverviewData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/inventory",
    table: "inventory",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <InventorySearchScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildInventorySearchData(user(r), "", "T-EXP")}
        master={buildInventoryListData(user(r), {}, "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/procurement",
    table: "procurement",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <ProcurementScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildProcurementData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/costing",
    table: "costing",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <CostingScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildCostingData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/physical-count",
    table: "physical-count",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <PhysicalCountScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildPhysicalCountData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/valuation",
    table: "valuation",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <ValuationScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildValuationData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/exceptions",
    table: "exceptions",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <ExceptionsScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildExceptionsData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/evidence",
    table: "evidence",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <EvidenceScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildEvidenceData(user(r), "", "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/reconciliation",
    table: "reconciliation",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <ReconciliationScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildReconciliationData(user(r), "", "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/adjustments",
    table: "adjustments",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <AdjustmentsScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildAdjustmentsData(user(r), "T-EXP")}
        setRoleAction={noopRole}
      />
    ),
  },
  {
    route: "/audit-package",
    table: "pbc",
    element: (r: Parameters<typeof userByRole>[0]) => (
      <AuditPackageScreen
        shell={buildShellData(user(r), "T-EXP")}
        data={buildAuditPackageData(user(r), "", "T-EXP")}
        manifest={buildPackageManifest(user(r), "T-EXP")}
        reproduceAction={noopReproduce}
        setRoleAction={noopRole}
      />
    ),
  },
] as const;

const exportLink = () => screen.queryByRole("link", { name: /Export .* as CSV/ });

describe("every population that can leave says how", () => {
  for (const s of SCREENS.filter((x) => x.table !== null)) {
    it(`${s.route} offers its file`, () => {
      render(s.element("CONTROLLER"));
      const link = exportLink();
      expect(link, s.route).toBeTruthy();
      expect(link?.getAttribute("href")).toBe(`/api/export/${s.table}`);
    });
  }

  it("covers every export table the handler serves", () => {
    // A table nothing links to is the defect this file exists for. If a new
    // table is added to EXPORT_TABLES, it must gain a screen here too.
    const linked = new Set(SCREENS.map((s) => s.table).filter(Boolean));
    for (const table of EXPORT_TABLES) {
      expect(linked.has(table), `${table} has no screen linking to it`).toBe(true);
    }
  });

  it("links only to tables the handler actually serves", () => {
    for (const s of SCREENS) {
      if (s.table === null) continue;
      expect((EXPORT_TABLES as readonly string[]).includes(s.table), s.route).toBe(true);
    }
  });
});

describe("no population is left without a way out", () => {
  it("gives every screen that owns a population an export table", () => {
    // There used to be three screens whose population had no table, each
    // saying so in the page head. Saying so was honest, but the gap was the
    // gap: the Overview, Physical Count and Valuation now export too, so the
    // stated-absence component has no case left and was removed with them.
    for (const s of SCREENS) {
      expect(s.table, `${s.route} owns a population with no export table`).not.toBeNull();
      // Rendered, not asserted against an empty DOM: the first version of
      // this check called queryByText without rendering anything, so it
      // could only ever pass.
      cleanup();
      render(s.element("CONTROLLER"));
      expect(screen.queryByText(/no export table/i), s.route).toBeNull();
      expect(exportLink(), s.route).toBeTruthy();
    }
  });
});

describe("the button never promises a file the viewer would be refused", () => {
  it("is absent on every screen the viewer's role cannot read", () => {
    // The handler answers 403 when the underlying query denies. Offering a
    // download that 403s is a claim the enforcement refuses — the exact
    // pattern the standing rule forbids.
    //
    // Restriction is measured as "the whole body is the access-restricted
    // state", not "the word appears somewhere". A nested panel can be
    // restricted while the screen is readable — a Warehouse user sees the
    // Overview's PBC panel withheld and the readiness figures beside it — and
    // treating that as a restricted screen would demand the link be removed
    // from a page whose own file the handler serves happily.
    //
    // ONE sweep over (screen, role), asserting both halves of the rule. It
    // used to be two tests doing the same 100 renders each; that passed on an
    // idle machine and timed out at 30s under full-suite load — the same
    // idle-vs-loaded trap that set this repo's testTimeout in the first place.
    let restrictedSeen = 0;
    let offeredSeen = 0;
    for (const s of SCREENS) {
      for (const demo of DEMO_USERS) {
        cleanup();
        const role = demo.roles[0] as Parameters<typeof userByRole>[0];
        try {
          render(s.element(role));
        } catch {
          continue;
        }
        const panels = document.querySelectorAll(".icg-workspace > .icg-panel");
        const bodyIsRestricted =
          panels.length === 1 &&
          panels[0]?.textContent?.includes("Access restricted") === true;
        if (bodyIsRestricted) {
          restrictedSeen += 1;
          expect(exportLink(), `${s.route} as ${role}`).toBeNull();
          continue;
        }
        // Readable: whatever it offers, the handler must honour.
        if (exportLink() === null) continue;
        offeredSeen += 1;
        expect(
          () => buildCsv(userByRole(role), s.table, "T-EXP"),
          `${s.route} offers ${role} a file the handler refuses`,
        ).not.toThrow();
      }
    }
    // If neither branch was ever taken, the assertions never ran and this
    // test proves nothing.
    expect(restrictedSeen).toBeGreaterThan(0);
    expect(offeredSeen).toBeGreaterThan(0);
    // Ten screens by ten demo users, each render building a whole close view.
    // This is the heaviest test in the suite by a wide margin and it needs its
    // own budget: it passed alone and timed out at the global 30s under full
    // parallel load — the idle-vs-loaded failure vitest.config.ts already
    // warns about. The timeout is raised HERE rather than globally, so the
    // rest of the suite keeps the tighter bound.
  }, 180_000);
});

describe("where the file is broader than the view, the button says so", () => {
  it("qualifies the exception queue, whose four views share one file", () => {
    // /cutoff and /ownership render this component filtered to a control
    // domain; the file is always all 15.
    render(
      <ExceptionsScreen
        shell={buildShellData(user(), "T-EXP")}
        data={buildExceptionsData(user(), "T-EXP", "cutoff")}
        setRoleAction={noopRole}
      />,
    );
    const filtered = buildExceptionsData(user(), "T-EXP", "cutoff");
    expect(filtered.filter).not.toBeNull();
    expect(filtered.rows.length).toBeLessThan(filtered.filter?.outOf ?? 0);
    expect(screen.getByText(/Every designed exception, not just this view's rows/)).toBeTruthy();
  });

  it("ties every qualification to its link for assistive tech", () => {
    for (const s of SCREENS) {
      if (s.table === null) continue;
      cleanup();
      render(s.element("CONTROLLER"));
      const link = exportLink();
      const describedBy = link?.getAttribute("aria-describedby");
      expect(describedBy, `${s.route} has no scope note`).toBeTruthy();
      const note = document.getElementById(describedBy ?? "");
      // A caption sitting loose beside the control is not part of the
      // control; aria-describedby is what makes it reach a screen reader.
      expect(note?.textContent?.length ?? 0, s.route).toBeGreaterThan(10);
    }
  });
});

describe("the file itself keeps the promises the screen makes", () => {
  const body = (role: Parameters<typeof userByRole>[0], table: (typeof EXPORT_TABLES)[number]) =>
    buildCsv(userByRole(role), table, "T-EXP").body;

  /** Data rows of a table: everything after its column header, unquoted. */
  const dataRows = (csv: string, firstHeaderCell: string): string[][] => {
    const lines = csv.split("\r\n");
    const start = lines.findIndex((l) => l.startsWith(`"${firstHeaderCell}"`));
    expect(start, `no header row starting ${firstHeaderCell}`).toBeGreaterThanOrEqual(0);
    return lines
      .slice(start + 1)
      .filter((l) => l.startsWith('"'))
      .map((l) => l.slice(1, -1).split('","'));
  };

  it("writes a GL account and a classification on every inventory row", () => {
    // Both columns were empty on all 1,500 rows: the handler asked the raw
    // fixture for `glAccount` and `accountingClassification`, neither of
    // which exists on it. A header with an empty cell asserts the unit has no
    // GL account, which is false.
    //
    // EVERY row, not a sample and not a serial-prefix subset — the first
    // version of this test filtered on "KE-/"KV-/"KA- and silently skipped
    // the 65 KG- and KR- rows, so blanking exactly those would have passed.
    const csv = body("CONTROLLER", "inventory");
    const header = csv.split("\r\n").find((l) => l.startsWith('"Serial"'))?.slice(1, -1).split('","') ?? [];
    const glAt = header.indexOf("GL account");
    const clsAt = header.indexOf("Classification");
    expect(glAt, "no GL account column").toBeGreaterThan(-1);
    expect(clsAt, "no Classification column").toBeGreaterThan(-1);
    const rows = dataRows(csv, "Serial");
    expect(rows).toHaveLength(1500);
    for (const cells of rows) {
      expect(cells[glAt], `${cells[0]} GL`).toMatch(/^1(200|210|220|230)$/);
      expect((cells[clsAt] ?? "").length, `${cells[0]} classification`).toBeGreaterThan(0);
    }
  });

  it("marks blockers as blockers rather than leaving OPEN to stand in", () => {
    const csv = body("CONTROLLER", "exceptions");
    const header = csv.split("\r\n").find((l) => l.startsWith('"ID"'))?.slice(1, -1).split('","') ?? [];
    const blockAt = header.indexOf("Blocks sign-off");
    expect(blockAt).toBeGreaterThan(-1);
    const flagged = dataRows(csv, "ID")
      .filter((c) => c[blockAt] === "BLOCKER")
      .map((c) => c[0]);
    // Identity against the service, not a count. A count of 7 is satisfied by
    // any seven rows.
    const blockers = getQueries()
      .getBlockers(makeContext(user(), "T-EXP"))
      .map((b) => b.exceptionId);
    expect([...flagged].sort()).toEqual([...blockers].sort());
  });

  it("reads the blocker column from getBlockers, which the data alone cannot prove", () => {
    // On this baseline all 7 open exceptions are also blockers, so a column
    // derived from `view.open` produces a byte-identical file and every
    // assertion above still passes. The coincidence is the whole reason the
    // column has to come from the blocker list — so the SOURCE is pinned
    // here, since the output cannot distinguish the two.
    const source = readFileSync(
      join(import.meta.dirname, "..", "lib", "server", "export-csv.ts"),
      "utf8",
    );
    const branch = source.slice(source.indexOf('table === "exceptions"'), source.indexOf('table === "reconciliation"'));
    expect(branch).toContain("getBlockers");
    expect(branch).toMatch(/blocking\.has\(/);
    // And the coincidence is real, so a future dataset that breaks it turns
    // the assertions above into a genuine discriminator rather than silently
    // leaving this test the only guard.
    const ctx = makeContext(user(), "T-EXP");
    const open = getQueries().listExceptions(ctx).filter((e) => e.open).length;
    expect(getQueries().getBlockers(ctx).length).toBe(open);
  });

  it("never reports a SKU/bin count variance as a unit's own", () => {
    // `InventoryMasterCount.basis` distinguishes a line that NAMED the serial
    // from one that counted its SKU and location as a quantity. A single
    // variance column put the bin's figure beside the serial and read as the
    // unit's — asserting a variance no count line attributed to it.
    const csv = body("CONTROLLER", "inventory");
    const header = csv.split("\r\n").find((l) => l.startsWith('"Serial"'))?.slice(1, -1).split('","') ?? [];
    const basisAt = header.indexOf("Count basis");
    const unitAt = header.indexOf("Unit variance");
    const binAt = header.indexOf("SKU / bin line variance");
    expect(Math.min(basisAt, unitAt, binAt)).toBeGreaterThan(-1);
    let namedRows = 0;
    let populationRows = 0;
    for (const cells of dataRows(csv, "Serial")) {
      const basis = cells[basisAt] ?? "";
      if (basis === "") continue;
      if (/unit not named/i.test(basis)) {
        populationRows += 1;
        expect(cells[unitAt], `${cells[0]} claims a unit variance`).toBe("");
      } else {
        namedRows += 1;
        expect(cells[binAt], `${cells[0]} claims a bin variance`).toBe("");
      }
    }
    // Both kinds must exist or this proves nothing.
    expect(namedRows).toBeGreaterThan(0);
    expect(populationRows).toBeGreaterThan(0);
  });

  /** The block of a sectioned file between one heading and the next. */
  const section = (csv: string, heading: string): string => {
    const at = csv.indexOf('"' + heading + '"');
    expect(at, `no section headed ${heading}`).toBeGreaterThan(-1);
    const rest = csv.slice(at + heading.length);
    const next = rest.search(/\r\n"[A-Z][A-Z ()/—-]{6,}"\r\n/);
    return next === -1 ? rest : rest.slice(0, next);
  };

  /** A labelled value row: asserts the VALUE sits beside its own label. */
  const valueFor = (csv: string, label: string): string => {
    const line = csv.split("\r\n").find((l) => l.startsWith('"' + label + '"'));
    expect(line, `no row labelled ${label}`).toBeDefined();
    return (line ?? "").slice(1, -1).split('","')[1] ?? "";
  };

  it("carries the count populations without inventing a serial for a quantity line", () => {
    const csv = body("CONTROLLER", "physical-count");
    const ctx = makeContext(user(), "T-EXP");
    const summary = getQueries().getCountSummary(ctx);
    const detail = getQueries().getCountDetail(ctx);
    for (const heading of [
      "COUNT SUMMARY — YEAR-END COUNT ONLY",
      "COUNT PLANS — ALL PLANS",
      "COUNT RESULTS — ALL PLANS",
      "TEST COUNTS",
      "MOVEMENTS DURING THE COUNT WINDOW",
    ]) {
      expect(csv, heading).toContain(heading);
    }
    // Bound to their labels. A bare toContain("1065") passes on any file
    // that happens to hold those digits anywhere.
    expect(valueFor(csv, "Count population (units)")).toBe(String(summary.populationUnits));
    expect(valueFor(csv, "First-pass matched (units)")).toBe(String(summary.firstPassMatchedUnits));
    expect(valueFor(csv, "First-pass variance rows")).toBe(String(summary.varianceRows));
    // The summary is year-end only while the sections span every plan. If
    // the file stops saying so, the two populations read as one.
    expect(section(csv, "COUNT SUMMARY — YEAR-END COUNT ONLY")).toMatch(/cycle\/spot/);

    // Asserted IN the results section. A whole-file search is satisfied by
    // the movements section, so blanking every unidentified count-result
    // serial kept the old assertion green.
    const results = section(csv, "COUNT RESULTS — ALL PLANS");
    const unidentified = detail.results.filter((r) => r.serial === undefined).length;
    expect(unidentified).toBeGreaterThan(0);
    expect((results.match(/"Not serial-identified"/g) ?? []).length).toBe(unidentified);

    // Every movement carries its size and its reason: five of six name no
    // serial, and without the quantity such a row has neither identity nor
    // magnitude.
    const movements = section(csv, "MOVEMENTS DURING THE COUNT WINDOW");
    for (const m of detail.movements) {
      expect(movements, m.id).toContain(m.reason);
      expect(movements, m.id).toContain('"' + m.quantity + '"');
    }

    // The one test that did not trace must be distinguishable from the rest.
    const tests = section(csv, "TEST COUNTS");
    const untraced = detail.tests.filter((t) => !t.traced);
    expect(untraced.length).toBeGreaterThan(0);
    expect((tests.match(/"DID NOT TRACE"/g) ?? []).length).toBe(untraced.length);
    for (const t of untraced) expect(tests, t.id).toContain(t.observation);

    // Auditor selections are recorded, never made by Gaurd.
    expect(csv).toContain("it never makes them");

    // The management indicators are RuleFindings, not a bespoke shape. A
    // first draft cast them to {countPlanId, kind, note} and wrote three
    // empty cells per row — a table of blanks asserting they carry nothing.
    expect(detail.managementIndicators.length).toBeGreaterThan(0);
    for (const i of detail.managementIndicators.slice(0, 5)) {
      expect(csv, i.title).toContain(i.whyFlagged);
    }
    // Those indicators cite a next-due date; the file must contain it.
    const plans = section(csv, "COUNT PLANS — ALL PLANS");
    for (const p of detail.plans.filter((x) => x.nextCountDue !== undefined)) {
      expect(plans, p.id).toContain(p.nextCountDue as string);
    }
  });

  it("never lets a reserve amount appear in the valuation file", () => {
    const csv = body("CONTROLLER", "valuation");
    const v = getQueries().getValuation(makeContext(user(), "T-EXP"));
    expect(valueFor(csv, "This period's conclusion")).toBe("UNDETERMINED");
    expect(valueFor(csv, "Basis")).toBe(v.reserve.conclusionNote);

    // The rule that matters, enforced rather than implied: the RESERVE
    // POSITION block may carry exactly ONE money figure — the balance
    // already recorded in the GL. Any second amount there is a reserve
    // somebody derived, and the old presence checks all passed with one added.
    const reserveBlock = section(csv, "RESERVE POSITION");
    const amounts = reserveBlock.match(/\(?\$[\d,]+(?:\.\d\d)?\)?/g) ?? [];
    expect(amounts).toHaveLength(1);

    // Age that cannot be established is its own row, never folded into a
    // band — an unknown age is not a fresh one.
    const agingBlock = section(csv, "INVENTORY AGING");
    expect(agingBlock).toContain("Age not established");
    for (const b of v.aging) expect(agingBlock, b.label).toContain(b.label);

    // Lenses over one book, not segments of it.
    expect(section(csv, "REVIEW POPULATIONS")).toMatch(/do not total them/i);
    // Selected by location; the RMA area is a different location entirely.
    expect(csv).not.toContain("DAMAGED AND RMA UNITS");
    expect(csv).toContain("DAMAGED / HOLD UNITS");
    const damaged = section(csv, "DAMAGED / HOLD UNITS");
    for (const d of v.damaged) {
      if (d.rmaId === undefined) expect(damaged, d.serial).toContain("No RMA record");
    }
    expect(damaged).toMatch(/Assessment (outstanding|concluded)|No assessment on file/);
    expect(csv).toContain("never a proposed reserve");
  });

  it("summarises the close without becoming a second source for it", () => {
    const csv = body("CONTROLLER", "close-summary");
    const readiness = getQueries().getCloseReadiness(makeContext(user(), "T-EXP"));
    const agg = readiness.aggregates;
    // Bound to labels: blockerCount is 7, and "7" appears all over this file.
    expect(valueFor(csv, "Sign-off blockers")).toBe(String(agg.blockerCount));
    expect(valueFor(csv, "Close readiness")).toBe(`${agg.closeReadinessBps} bps`);
    expect(valueFor(csv, "Designed exceptions")).toBe(String(agg.exceptionCount));
    expect(valueFor(csv, "Ready or provided")).toBe(`${agg.pbcReady} of ${agg.pbcTotal}`);
    for (const c of readiness.categories) expect(csv, c.label).toContain(c.label);
    // Readiness is a management measure and the file says so where the
    // figure is, not in a footnote a reader may not reach.
    expect(section(csv, "SIGN-OFF POSITION")).toMatch(/not audit assurance/i);
    // The nine source domains carry EQUAL weight; calling the mean
    // "weighted" beside a table with a Weight (%) column read otherwise.
    expect(csv).not.toMatch(/Weighted across the nine source domains/);
    expect(csv).toMatch(/each counting equally/);
    // And it does not present itself as the whole close.
    expect(csv).toMatch(/exported in full by its own table/i);
  });

  it("never sends a reader to an export their own role is refused", () => {
    // The closing note enumerates the tables carrying each population in
    // full. Warehouse, Supply Chain and Legal hold close.read but not
    // pbc.read, so naming "pbc" to them promises a file the handler 403s.
    let rolesWithoutPbc = 0;
    for (const demo of DEMO_USERS) {
      const role = demo.roles[0] as Parameters<typeof userByRole>[0];
      let csv: string;
      try {
        csv = body(role, "close-summary");
      } catch {
        continue;
      }
      const named = (/exported in full by its own table — ([^"]*)/.exec(csv)?.[1] ?? "")
        .split(/,| and |—/)
        .map((t) => t.trim().replace(/\.$/, ""))
        .filter((t) => (EXPORT_TABLES as readonly string[]).includes(t));
      expect(named.length, role).toBeGreaterThan(0);
      for (const t of named) {
        expect(
          () => buildCsv(userByRole(role), t as (typeof EXPORT_TABLES)[number], "T-EXP"),
          `close-summary tells ${role} to fetch ${t}, which the handler refuses`,
        ).not.toThrow();
      }
      if (!named.includes("pbc")) rolesWithoutPbc += 1;
    }
    // The roles that cannot read pbc must exist, or this proves nothing.
    expect(rolesWithoutPbc).toBeGreaterThan(0);
  });

  it("tags every reconciling item as unposted", () => {
    const csv = body("CONTROLLER", "reconciliation");
    // The screen makes the proposed/posted distinction with a literal tag;
    // the file must not drop it.
    expect((csv.match(/"NOT POSTED"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("reports the same 'None provided' the PBC screen reports", () => {
    const csv = body("CONTROLLER", "pbc");
    const data = buildAuditPackageData(user(), "", "T-EXP");
    const unprovided = (data.rows ?? []).filter((r) => /None provided/.test(r.versions ?? ""));
    expect(unprovided.length).toBeGreaterThan(0);
    // The file used to write versions.length here, so fourteen rows read
    // "1 version" beside a screen saying "None provided".
    expect((csv.match(/"None provided"/g) ?? []).length).toBe(unprovided.length);
  });
});

describe("the auditor's scope line describes what was actually withheld", () => {
  const rowsOf = (role: Parameters<typeof userByRole>[0], table: (typeof EXPORT_TABLES)[number]) =>
    buildCsv(userByRole(role), table, "T-EXP").body.split("\r\n").length;

  it("claims a redaction only on the tables that redact", () => {
    for (const table of EXPORT_TABLES) {
      const auditor = buildCsv(userByRole("AUDITOR_READ_ONLY"), table, "T-EXP").body;
      const claims = auditor.includes("Auditor scope");
      const narrower = rowsOf("AUDITOR_READ_ONLY", table) < rowsOf("CONTROLLER", table);
      if (narrower) {
        expect(claims, `${table} withholds rows but claims nothing`).toBe(true);
      }
      // The inverse is allowed: pbc and procurement withhold WITHIN a row
      // (versions, documents) while every row still appears. What is not
      // allowed is a table that neither narrows nor withholds carrying the
      // sentence anyway.
      if (claims && !narrower) {
        expect(
          ["pbc", "procurement"].includes(table),
          `${table} claims a redaction it does not perform`,
        ).toBe(true);
      }
    }
  });

  it("still narrows the evidence file, and says so", () => {
    expect(rowsOf("AUDITOR_READ_ONLY", "evidence")).toBeLessThan(rowsOf("CONTROLLER", "evidence"));
    expect(buildCsv(userByRole("AUDITOR_READ_ONLY"), "evidence", "T-EXP").body).toContain(
      "Auditor scope",
    );
  });
});

describe("no screen makes a claim about another screen's capability", () => {
  it("keeps every scope note about the screen carrying it", () => {
    // The Overview's note read "…each section below exports its own", which
    // was false three ways: two screens carried the opposite sentence, Cutoff
    // and Ownership export the whole exception queue rather than their own
    // view, and no Overview panel exported at all. A screen knows its own
    // capability and nothing about anyone else's.
    let checked = 0;
    for (const s of SCREENS) {
      cleanup();
      render(s.element("CONTROLLER"));
      const note = document.querySelector(".icg-export-note")?.textContent ?? "";
      expect(note.length, s.route).toBeGreaterThan(0);
      checked += 1;
      // A note may describe its own file freely — including saying the file
      // is a summary of populations exported elsewhere. What it may not do is
      // assert that a NAMED other surface does or does not export, which is
      // the claim it has no way to check.
      expect(note, s.route).not.toMatch(
        /\b(each|every|other|the)\s+(section|screen|page)s?\b[^.]*\bexports?\b/i,
      );
      expect(note, s.route).not.toMatch(/below\s+exports?\b/i);
    }
    expect(checked).toBe(SCREENS.length);
  });

  it("keeps the guide's account of export consistent with what the screens do", () => {
    // The guide is the one place a first-time reader is told what to expect,
    // so its claim is derived from the screens rather than written beside
    // them. Every population now exports; if one stopped, the guide would
    // have to say so, and this fails until it does.
    const withoutTable = SCREENS.filter((s) => s.table === null);
    const guide = readFileSync(
      join(import.meta.dirname, "..", "components", "UserGuideScreen.tsx"),
      "utf8",
    );
    const entry = guide.slice(guide.indexOf("Lets the work leave"));
    const note = entry.slice(0, entry.indexOf("},"));
    expect(note).toMatch(/EXPORT CSV/);
    if (withoutTable.length === 0) {
      expect(note).toMatch(/Every screen that owns a population carries/);
      expect(note).not.toMatch(/no export table/i);
    } else {
      expect(note).toMatch(/no export table/i);
      expect(note).not.toMatch(/Every screen that owns a population carries/);
    }
  });
});

describe("the nav and the affordance agree about what exists", () => {
  it("puts an export control or a stated absence on every navigable population", () => {
    // A section in the rail that is neither exportable nor says why would be
    // the gap this whole file is about, returning quietly.
    const covered = new Set<string>(SCREENS.map((s) => s.route));
    const uncovered = NAV_SECTIONS.map((s) => s.href).filter(
      (href) => !covered.has(href) && href !== "/user-guide" && href !== "/cutoff" && href !== "/ownership",
    );
    expect(uncovered).toEqual([]);
  });
});
