// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { OverviewScreen } from "../components/OverviewScreen";
import { buildOverviewData, buildShellData } from "../lib/server/data";
import { getQueries, makeContext } from "../lib/server/workspace";

/**
 * Full-tree adversarial review regressions — UI copy (post stage 09).
 *
 * Both confirmed defects used this product's own word for a DIFFERENT
 * number: the register's vocabulary is identified (a reconciling item),
 * drafted (an entry written for it), posted (never). "Proposed" means
 * drafted, so counting all three identified items as proposed asserted an
 * entry that was never written. The tests below are written against the
 * register rather than against the numbers, so they keep working if the
 * dataset changes.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function services(role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return { user, queries: getQueries(), ctx: makeContext(user, "T-FTR") };
}

function renderOverview(role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <OverviewScreen
      shell={buildShellData(user, "T-FTR")}
      data={buildOverviewData(user, "T-FTR")}
      setRoleAction={noopRole}
    />,
  );
}

describe("the Overview never counts an identified item as a drafted entry", () => {
  it("has a register where the two counts genuinely differ, or this test proves nothing", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    expect(register.identifiedCount).toBeGreaterThan(register.draftedCount);
    expect(register.postedCount).toBe(0);
  });

  it("carries both counts on the GL panel, each labelled for what it is", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    const data = buildOverviewData(userByRole("CONTROLLER"), "T-FTR");
    expect(data.glPanel?.identifiedCount).toBe(register.identifiedCount);
    expect(data.glPanel?.draftedCount).toBe(register.draftedCount);

    renderOverview();
    expect(
      screen.getByText(
        new RegExp(
          `${register.identifiedCount} identified,\\s*${register.draftedCount} drafted, none posted`,
        ),
      ),
    ).toBeTruthy();
    // The overstatement itself: the identified count wearing the word the
    // product reserves for a drafted entry.
    expect(screen.queryByText(new RegExp(`${register.identifiedCount} proposed`))).toBeNull();
  });

  it("states the close-area note as a ratio the readiness score can be read from", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    const data = buildOverviewData(userByRole("CONTROLLER"), "T-FTR");
    const adjustments = data.closeAreas?.categories.find((c) => c.key === "ADJUSTMENTS");
    expect(adjustments?.note).toBe(
      `${register.draftedCount} of ${register.identifiedCount} drafted, none posted`,
    );
    expect(adjustments?.note).not.toMatch(
      new RegExp(`^${register.identifiedCount} proposed`),
    );
  });

  it("keeps every Overview adjustment count reconciled with the register", () => {
    const { queries, ctx } = services();
    const register = queries.getAdjustmentRegister(ctx);
    const proposals = queries.getReconciliation(ctx);
    // The product's three numbers, and what each one means.
    expect(register.identifiedCount).toBe(proposals.items.length);
    expect(register.draftedCount).toBe(
      register.entries.filter((e) => e.proposal !== undefined).length,
    );
    renderOverview();
    // Nowhere on the Overview may the identified count be called posted.
    expect(
      screen.queryByText(new RegExp(`${register.identifiedCount}\\s+posted`)),
    ).toBeNull();
  });
});
