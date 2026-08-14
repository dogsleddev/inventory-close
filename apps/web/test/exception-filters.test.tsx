// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { ExceptionsScreen } from "../components/ExceptionsScreen";
import {
  EXCEPTION_SECTIONS,
  buildExceptionsData,
  buildShellData,
  resolveExceptionFilter,
} from "../lib/server/data";
import { FOLDED_ROUTES } from "../lib/nav";

/**
 * The four views of the exception queue, after Cutoff and Ownership stopped
 * being rail entries.
 *
 * This file exists because of a measured hole. The `?filter=` -> lens mapping
 * was first written inline inside `/exceptions/page.tsx`; deleting it whole
 * left **all 688 app tests green** while every folded URL quietly rendered
 * the unfiltered queue. A decision inside a server component is one no test
 * can reach, so the decision moved to `resolveExceptionFilter` and is
 * asserted here — both as a mapping and through a rendered screen.
 */

afterEach(cleanup);
const noopRole = vi.fn(async () => {});
const user = () => userByRole("CONTROLLER");

const renderFilter = (filter: string | undefined) => {
  const { sectionKey, filterKey } = resolveExceptionFilter(filter);
  const data = buildExceptionsData(user(), "T-FILTER", sectionKey, filterKey);
  render(
    <ExceptionsScreen
      shell={buildShellData(user(), "T-FILTER")}
      data={data}
      setRoleAction={noopRole}
    />,
  );
  return data;
};

describe("a folded URL reaches the population it used to be a route for", () => {
  it("routes a control-domain filter to the lens, not to the blocker filter", () => {
    // The exact mutation that stayed green: sectionKey undefined for both.
    expect(resolveExceptionFilter("cutoff")).toEqual({
      sectionKey: "cutoff",
      filterKey: undefined,
    });
    expect(resolveExceptionFilter("ownership")).toEqual({
      sectionKey: "ownership",
      filterKey: undefined,
    });
    // "blockers" is NOT a control domain and must stay on the other argument,
    // or it would be looked up in EXCEPTION_SECTIONS and silently vanish.
    expect(resolveExceptionFilter("blockers")).toEqual({
      sectionKey: undefined,
      filterKey: "blockers",
    });
    expect(resolveExceptionFilter(undefined)).toEqual({
      sectionKey: undefined,
      filterKey: undefined,
    });
  });

  it("derives its section keys from EXCEPTION_SECTIONS rather than a literal", () => {
    // A hand-copied list here would be a test with an expiry date nobody set.
    for (const key of Object.keys(EXCEPTION_SECTIONS)) {
      expect(resolveExceptionFilter(key).sectionKey, key).toBe(key);
    }
  });

  it("narrows the rendered queue, and says what it narrowed to", () => {
    const all = renderFilter(undefined);
    cleanup();
    const cutoff = renderFilter("cutoff");

    // The premise: the filter actually removes rows. Without this the
    // assertions below would hold on an unfiltered page.
    expect(all.filter).toBeNull();
    expect(cutoff.filter).not.toBeNull();
    expect(cutoff.rows.length).toBeGreaterThan(0);
    expect(cutoff.rows.length).toBeLessThan(all.rows.length);
    expect(cutoff.filter?.shown).toBe(cutoff.rows.length);
    expect(cutoff.filter?.outOf).toBe(all.rows.length);
    // And it states the basis on the page rather than presenting a subset as
    // the whole close.
    expect(screen.getByText(/control domain/i)).toBeTruthy();
  });

  it("offers all four views as controls, with the active one marked", () => {
    // Before the fold there was NO filter control on this screen at all: the
    // active filter was named in the heading and offered nowhere. Two of
    // these views used to be rail entries, so being reachable is not optional.
    renderFilter("ownership");
    const links = ["All exceptions", "Preventing sign-off", "Cutoff", "Ownership"].map((n) =>
      screen.getByRole("link", { name: n }),
    );
    expect(links).toHaveLength(4);
    const active = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toBe("Ownership");
  });

  it("keeps the rail on Exceptions inside a filtered view", () => {
    // AppShell matches the active rail item by byte-equal label. While these
    // were rail entries their titles matched a label by coincidence; passing
    // the filter title now would highlight nothing.
    const src = readFileSync(
      join(import.meta.dirname, "..", "components", "ExceptionsScreen.tsx"),
      "utf8",
    );
    expect(src).toContain('section="Exceptions"');
    renderFilter("cutoff");
    expect(
      screen.getByRole("link", { name: /Exceptions/ }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("points every folded route at a filter this screen actually serves", () => {
    // The redirect destination and the filter vocabulary are one fact. A
    // redirect to a filter nobody handles would render the whole queue and
    // lose the view without failing anything.
    for (const to of Object.values(FOLDED_ROUTES)) {
      const key = new URL(to, "https://x").searchParams.get("filter");
      expect(key, to).not.toBeNull();
      expect(resolveExceptionFilter(key as string).sectionKey, to).toBe(key);
    }
  });
});
