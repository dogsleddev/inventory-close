// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { EvidenceScreen } from "../components/EvidenceScreen";
import { buildShellData } from "../lib/server/data";
import { buildEvidenceData } from "../lib/server/evidence-view";
import { getQueries, makeContext } from "../lib/server/workspace";

/**
 * Evidence Center (completion Stage A). This screen replaced a "not designed
 * yet" placeholder, so the tests here are mostly about the two ways an index
 * of evidence can lie: by counting gaps that are not open, and by rendering a
 * scoped list as though it were the whole graph.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function data(role: Parameters<typeof userByRole>[0]) {
  return buildEvidenceData(userByRole(role), "T-EVID");
}

function renderFor(role: Parameters<typeof userByRole>[0]) {
  const user = userByRole(role);
  return render(
    <EvidenceScreen
      shell={buildShellData(user, "T-EVID")}
      data={buildEvidenceData(user, "T-EVID")}
      setRoleAction={noopRole}
    />,
  );
}

describe("Evidence Center — the index", () => {
  it("lists every evidence record the services return, once each", () => {
    const controller = userByRole("CONTROLLER");
    const items = getQueries().listEvidence(makeContext(controller, "T-EVID"));
    const view = data("CONTROLLER");
    expect(view.rows).toHaveLength(items.length);
    expect(new Set(view.rows.map((r) => r.id)).size).toBe(view.rows.length);
  });

  it("names each record's relationship to the exception it bears on", () => {
    const rows = data("CONTROLLER").rows;
    const conflicting = rows.find((r) => r.relations.some((rel) => rel.conflict));
    expect(conflicting, "a conflicting record must exist and be marked").toBeDefined();
    expect(conflicting?.relations.some((rel) => rel.label === "Conflicts with")).toBe(true);
    // Every relation resolves to a real exception id.
    for (const row of rows) {
      for (const rel of row.relations) {
        expect(rel.exceptionId, row.id).toMatch(/^EXC-\d{3}$/);
      }
    }
  });

  it("counts as outstanding only the requirements of exceptions that are open", () => {
    const controller = makeContext(userByRole("CONTROLLER"), "T-EVID");
    const queries = getQueries();
    const openIds = new Set(
      queries
        .listExceptions(controller)
        .filter((v) => v.open)
        .map((v) => v.exception.id),
    );
    const gaps = data("CONTROLLER").links;
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      // A resolved item's unmet requirement is answered by the management
      // conclusion; listing it here would overstate what the close is waiting on.
      expect(openIds.has(gap.exceptionId), `${gap.exceptionId} is not open`).toBe(true);
    }
  });

  it("derives source health from the services rather than restating it", () => {
    const controller = makeContext(userByRole("CONTROLLER"), "T-EVID");
    const health = getQueries().getSourceHealth(controller);
    const view = data("CONTROLLER");
    expect(view.sources).toHaveLength(health.sources.length);
    expect(view.sourceHealth?.degraded).toBe(
      health.sources.filter((s) => String(s.status) !== "HEALTHY").length,
    );
  });
});

describe("Evidence Center — scope is stated, never implied", () => {
  it("tells an auditor the index is scoped instead of showing a shorter list silently", () => {
    const auditor = data("AUDITOR_READ_ONLY");
    const controller = data("CONTROLLER");
    expect(auditor.rows.length).toBeLessThan(controller.rows.length);
    expect(auditor.scopeNotice, "a narrower list must say why").not.toBeNull();
    expect(controller.scopeNotice).toBeNull();
  });

  it("shows a withheld record as withheld rather than dropping it", () => {
    const preparer = data("PREPARER");
    const withheld = preparer.rows.filter((r) => r.withheld);
    expect(withheld.length).toBeGreaterThan(0);
    // Existence stays visible; only the content is withheld.
    for (const row of withheld) {
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.hash.length).toBeGreaterThan(0);
    }
  });

  it("renders the gap rows as missing and required for assistive tech", () => {
    renderFor("CONTROLLER");
    expect(screen.getAllByText(/— missing, required/).length).toBeGreaterThan(0);
  });
});
