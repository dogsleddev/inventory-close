// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { ExceptionDetailScreen } from "../components/ExceptionDetailScreen";
import {
  buildExceptionDetailData,
  buildExceptionsData,
  buildOverviewData,
  buildShellData,
} from "../lib/server/data";

/**
 * The surface may never assert more than the services returned. These are
 * regressions for three defects found by the stage-05 fleet review, each of
 * which made a screen state something untrue about evidence:
 *   1. a required record that never arrived rendering as a positive "Known ✓"
 *   2. every unmet requirement described as a missing contract provision,
 *      attributed to a source system that returned nothing
 *   3. a shipment still moving at period end reported as no evidence at all
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
const controller = userByRole("CONTROLLER");

function detail(id: string) {
  return buildExceptionDetailData(controller, id, "T-TRUTH");
}

function renderDetail(id: string) {
  return render(
    <ExceptionDetailScreen
      shell={buildShellData(controller, "T-TRUTH")}
      data={detail(id)}
      setRoleAction={noopRole}
    />,
  );
}

const ALL_IDS = buildExceptionsData(controller, "T-TRUTH").rows.map((r) => r.id);

describe("missing required evidence never reads as a positive state", () => {
  it("EXC-007's un-returned custodian statement is a gap, not 'Known'", () => {
    const record = Object.values(detail("EXC-007").evidenceRecords ?? {}).find(
      (r) => r.kind === "CUSTODIAN_STATEMENT",
    );
    expect(record).toBeDefined();
    expect(record?.state).toBe("Required — not received");
    expect(record?.stateVariant).toBe("missing");
    expect(record?.stateGlyph).toBe("○");
    expect(record?.title).toContain("not received");
  });

  it("no required-evidence gap of any kind renders as resolved, on any exception", () => {
    for (const id of ALL_IDS) {
      for (const record of Object.values(detail(id).evidenceRecords ?? {})) {
        if (record.state === "Known") {
          expect(record.stateVariant, `${id} ${record.id}`).toBe("resolved");
          expect(record.stateGlyph, `${id} ${record.id}`).toBe("✓");
          expect(record.title, `${id} ${record.id}`).not.toMatch(/missing|not received/i);
        }
      }
    }
  });
});

/** The lens carrying this exception's gap, whatever that lens is called. */
function gapLens(id: string) {
  return (detail(id).lenses?.panels ?? []).find((l) => l.missingChip !== null);
}

/** Everything the gap lens says, so the assertion is shape-agnostic. */
function gapText(id: string): string {
  const g = gapLens(id);
  return [g?.headline, g?.sub, g?.missingChip?.label].filter(Boolean).join(" ");
}

function lensByKey(id: string, key: string) {
  return (detail(id).lenses?.panels ?? []).find((l) => l.key === key);
}

describe("the lens that carries the gap describes the gap this exception actually has", () => {
  it("only a contract-provision gap is called a provision", () => {
    // EXC-001/002 have a contract on file whose provision is absent.
    expect(gapLens("EXC-001")?.headline).toBe("Required provision missing");
    expect(gapLens("EXC-002")?.headline).toBe("Required provision missing");
    // These gaps are a recount, a custodian confirmation, an E&O analysis and
    // JE support — no contract is involved in any of them.
    for (const id of ["EXC-003", "EXC-007", "EXC-011", "EXC-015"]) {
      expect(gapLens(id), id).toBeDefined();
      expect(gapText(id), id).not.toMatch(/provision|agreement|transfer of control/i);
    }
  });

  it("names the real requirement rather than EXC-001's ownership story", () => {
    expect(gapText("EXC-003")).toContain("Supervised recount locating the unit");
    expect(gapText("EXC-011")).toContain("Management E&O analysis and reserve conclusion");
    expect(gapText("EXC-015")).toContain("Supporting documentation for the manual entry");
  });

  it("attributes the missing chip only to a source the services returned", () => {
    for (const id of ALL_IDS) {
      for (const panel of detail(id).lenses?.panels ?? []) {
        const chip = panel.missingChip;
        if (chip === null) continue;
        // A gap with no record behind it has no source system to name.
        if (chip.evidenceId === null) expect(chip.src, `${id} ${panel.key}`).toBe("—");
        // And the converse: a missing chip may only point at the record the
        // requirement is actually about — the one the product itself lists as
        // missing. Pointing it at some OTHER record that happens to be on the
        // page (the journal entry whose support is absent, say) claims a
        // system was asked for the absent document and answered.
        if (chip.evidenceId !== null) {
          const missingIds = (detail(id).evidenceState?.missing ?? []).map((m) => m.evidenceId);
          expect(missingIds, `${id} ${panel.key} chip must resolve to the missing record`).toContain(
            chip.evidenceId,
          );
        }
      }
    }
    expect(gapLens("EXC-007")?.missingChip?.src).toBe("—");
    expect(gapLens("EXC-015")?.missingChip?.src).toBe("—");
    expect(gapLens("EXC-001")?.missingChip?.src).toBe("ACCORDVAULT");
  });

  it("does not print ACCORDVAULT on a screen whose gap has no source", () => {
    const { container } = renderDetail("EXC-011");
    expect(container.textContent).not.toContain("ACCORDVAULT");
    expect(
      screen.getAllByText(/Management E&O analysis and reserve conclusion/).length,
    ).toBeGreaterThan(0);
  });
});

describe("lenses are domain-aware and never filled with nothing", () => {
  it("no exception renders a lens that says its evidence is out of scope", () => {
    for (const id of ALL_IDS) {
      for (const panel of detail(id).lenses?.panels ?? []) {
        expect(panel.headline, `${id} ${panel.key}`).not.toMatch(
          /no operational evidence|nothing in scope|not applicable/i,
        );
      }
    }
  });

  it("a count exception separates book, count and movement — not NetSuite/physical/accounting", () => {
    const keys = (detail("EXC-003").lenses?.panels ?? []).map((l) => l.key);
    expect(keys).toContain("book");
    expect(keys).toContain("count");
    expect(keys).toContain("movement");
    expect(keys).not.toContain("physical");
  });

  it("a manual journal entry has no physical dimension and does not pretend to", () => {
    const keys = (detail("EXC-015").lenses?.panels ?? []).map((l) => l.key);
    expect(keys).toEqual(["gl-record", "support", "control"]);
  });

  it("the valuation lenses state the reserve is undetermined and propose no amount", () => {
    const conclusion = lensByKey("EXC-011", "valuation-conclusion");
    expect(conclusion?.headline).toBe("Reserve UNDETERMINED");
    const text = (detail("EXC-011").lenses?.panels ?? [])
      .map((l) => `${l.headline} ${l.sub ?? ""}`)
      .join(" ");
    // No lens may put a number next to the word reserve.
    expect(text).not.toMatch(/reserve[^.]*\$/i);
  });

  it("EXC-001 keeps the canonical three-layer reality", () => {
    expect((detail("EXC-001").lenses?.panels ?? []).map((l) => l.key)).toEqual([
      "netsuite",
      "physical",
      "accounting",
    ]);
    expect(detail("EXC-001").lenses?.interpretation?.label).toBe("LOCATION IS NOT OWNERSHIP");
  });
});

describe("a shipment still moving at period end is shown, not denied", () => {
  it("EXC-002's carrier evidence reaches the timeline and reads in transit", () => {
    const data = detail("EXC-002");
    const carrier = Object.values(data.evidenceRecords ?? {}).find(
      (r) => r.kind === "CARRIER_SHIPMENT",
    );
    expect(carrier).toBeDefined();
    const entry = data.timeline?.entries.find((e) => e.evidenceId === carrier?.id);
    expect(entry, "carrier shipment must not vanish from the chronology").toBeDefined();
    expect(entry?.label).toBe("Carrier shipment — in transit");
    expect(entry?.date).toBe("Dec. 31");
  });

  it("the Overview drawer states the carrier position instead of claiming none", () => {
    const overview = buildOverviewData(controller, "T-TRUTH");
    expect(overview.restricted).toBe(false);
    expect(overview.drawers?.["EXC-002"]?.layers.physical).toBe("in transit Dec. 31");
  });

  it("inbound goods in transit are never described as deployed to a customer", () => {
    const physical = lensByKey("EXC-002", "physical");
    expect(physical?.headline).toBe("In transit — no delivery recorded");
    expect(physical?.facts.map((f) => f.label)).toEqual(["IN TRANSIT"]);
  });

  it("EXC-001 is unchanged: delivered, deployed, never in transit", () => {
    const physical = lensByKey("EXC-001", "physical");
    expect(physical?.headline).toBe("Deployed to customer before year-end");
    expect(physical?.facts.map((f) => f.label)).toEqual([
      "SHIPPED",
      "DELIVERED",
      "INSTALLED",
      "FIRST ONLINE",
    ]);
    const { container } = renderDetail("EXC-001");
    expect(container.textContent).not.toMatch(/in transit/i);
  });
});
