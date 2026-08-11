// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole, DEMO_USERS } from "@icg/data";
import { AdjustmentsScreen } from "../components/AdjustmentsScreen";
import { AuditPackageScreen } from "../components/AuditPackageScreen";
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
    table: null,
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
    route: "/physical-count",
    table: null,
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
    table: null,
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

describe("a screen with no export table states the absence", () => {
  for (const s of SCREENS.filter((x) => x.table === null)) {
    it(`${s.route} says so rather than showing nothing`, () => {
      render(s.element("CONTROLLER"));
      expect(exportLink(), s.route).toBeNull();
      // Silence would leave a reader unable to tell "cannot be exported" from
      // "someone forgot" — the same reason this codebase never hides a
      // disabled action.
      expect(screen.getByText(/no export table/i), s.route).toBeTruthy();
    });
  }
});

describe("the button never promises a file the viewer would be refused", () => {
  it("is absent on every screen the viewer's role cannot read", () => {
    // The handler answers 403 when the underlying query denies. Offering a
    // download that 403s is a claim the enforcement refuses — the exact
    // pattern the standing rule forbids.
    let restrictedSeen = 0;
    for (const s of SCREENS) {
      if (s.table === null) continue;
      for (const demo of DEMO_USERS) {
        cleanup();
        const role = demo.roles[0] as Parameters<typeof userByRole>[0];
        let restricted = false;
        try {
          render(s.element(role));
        } catch {
          continue;
        }
        restricted = screen.queryByText(/Access restricted/) !== null;
        if (!restricted) continue;
        restrictedSeen += 1;
        expect(exportLink(), `${s.route} as ${role}`).toBeNull();
      }
    }
    // If no screen was ever restricted for any demo role, the assertion above
    // never ran and this test proves nothing.
    expect(restrictedSeen).toBeGreaterThan(0);
  });

  it("gives every role that CAN read a screen a file it can actually build", () => {
    for (const s of SCREENS) {
      if (s.table === null) continue;
      for (const demo of DEMO_USERS) {
        cleanup();
        const role = demo.roles[0] as Parameters<typeof userByRole>[0];
        try {
          render(s.element(role));
        } catch {
          continue;
        }
        if (exportLink() === null) continue;
        expect(
          () => buildCsv(userByRole(role), s.table, "T-EXP"),
          `${s.route} offers ${role} a file the handler refuses`,
        ).not.toThrow();
      }
    }
  });
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
  it("keeps each stated absence about the screen stating it", () => {
    // The Overview's note read "…each section below exports its own", which
    // was false three ways: Physical Count and Valuation carry the opposite
    // sentence, Cutoff and Ownership export the whole exception queue rather
    // than their own view, and no Overview panel exports at all. A screen
    // knows its own capability and nothing about anyone else's.
    for (const s of SCREENS.filter((x) => x.table === null)) {
      cleanup();
      render(s.element("CONTROLLER"));
      const note = document.querySelector(".icg-export-note")?.textContent ?? "";
      expect(note.length, s.route).toBeGreaterThan(0);
      // Says where its own figures come from, freely. What it may not do is
      // promise that some OTHER screen exports — the claim it cannot check.
      expect(note, s.route).not.toMatch(
        /\b(each|every|other|the)\s+(section|screen|page)s?\b[^.]*\bexport/i,
      );
      expect(note, s.route).not.toMatch(/below\s+export/i);
    }
  });

  it("keeps the guide's account of export consistent with what the screens do", () => {
    // Some populations export and some do not. A guide that said "every"
    // would be the same over-reach in the one place a first-time reader is
    // told what to expect.
    const withTable = SCREENS.filter((s) => s.table !== null).length;
    const withoutTable = SCREENS.filter((s) => s.table === null).length;
    expect(withTable).toBeGreaterThan(0);
    expect(withoutTable).toBeGreaterThan(0);
    const guide = readFileSync(
      join(import.meta.dirname, "..", "components", "UserGuideScreen.tsx"),
      "utf8",
    );
    const entry = guide.slice(guide.indexOf("Lets the work leave"));
    const note = entry.slice(0, entry.indexOf("},"));
    expect(note).toMatch(/EXPORT CSV/);
    // Because some populations have no table, the guide has to say so.
    expect(note).toMatch(/no export table/i);
    expect(note).not.toMatch(/Every screen that owns a population carries/);
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
