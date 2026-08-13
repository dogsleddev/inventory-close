// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { EvidenceScreen } from "../components/EvidenceScreen";
import { buildShellData } from "../lib/server/data";
import { buildEvidenceData } from "../lib/server/evidence-view";
import { getQueries, makeContext } from "../lib/server/workspace";
import {
  concludeException,
  controller,
  resetDemo,
  satisfyRequirements,
} from "./support/live-close";

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

/**
 * "Required, with no record behind it" — after the record arrives.
 *
 * The panel built this list from `listExceptions().filter(view => view.open)`
 * and `finding.evidenceRequirements.filter(r => r.required && !r.satisfied)`.
 * BOTH are frozen: `open` never moves, and `satisfied` is a literal baked by
 * the rules engine (packages/rules/src/rules/counts.ts:62 `satisfied: false`).
 * So the Controller could submit EXC-003's one required record, the Accounting
 * Manager could accept it, and the row stayed — and after the conclusion it
 * stayed again, under this panel's own subtitle promising "Open exceptions
 * only — a resolved item's requirement is answered by management's
 * conclusion".
 *
 * Two states are asserted separately because they fail through different
 * halves of the read: acceptance kills the requirement, the conclusion kills
 * the exception.
 */
describe("Evidence Center — the missing list stops demanding what arrived", () => {
  afterEach(resetDemo);

  const data = (correlationId: string) => buildEvidenceData(controller(), correlationId);
  const rowsFor = (correlationId: string, id: string) =>
    data(correlationId).links.filter((l) => l.exceptionId === id);

  it("drops the requirement once the record is submitted and accepted", () => {
    const before = data("T-EV-BEFORE");
    const beforeRows = before.links.filter((l) => l.exceptionId === "EXC-003");
    expect(beforeRows.map((r) => r.description)).toEqual([
      "Supervised recount locating the unit",
    ]);
    const missingBefore = before.counts.missing;
    expect(missingBefore).toBeGreaterThan(0);

    satisfyRequirements("EXC-003");

    const after = data("T-EV-ACCEPTED");
    expect(after.links.filter((l) => l.exceptionId === "EXC-003")).toEqual([]);
    expect(after.counts.missing).toBe(missingBefore - 1);
  });

  it("drops the exception entirely once management concludes", () => {
    expect(rowsFor("T-EV-C-BEFORE", "EXC-003").length).toBe(1);

    concludeException("EXC-003");

    expect(rowsFor("T-EV-C-AFTER", "EXC-003")).toEqual([]);
  });
});
