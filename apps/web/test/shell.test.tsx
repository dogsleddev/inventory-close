// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { userByRole } from "@icg/data";
import { AppShell } from "../components/AppShell";
import { buildOverviewData, buildShellData } from "../lib/server/data";
import { FOLDED_ROUTES, NAV_ITEMS, NAV_SECTIONS } from "../lib/nav";
import { THEME_ATTR, THEME_BOOTSTRAP, THEME_KEY } from "../lib/theme";
import { concludeException, controller, resetDemo, resolveAllBut } from "./support/live-close";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTR);
});

const noopRole = vi.fn(async () => {});

/**
 * The shell under test, with the thinnest possible page inside it. This used
 * to be the "not designed yet" placeholder screen; that screen no longer
 * exists, because every nav entry now resolves to a built route.
 */
function renderShell(setRole: (userId: string) => Promise<void> = noopRole) {
  const user = userByRole("CONTROLLER");
  return render(
    <AppShell
      shell={buildShellData(user, "T-SHELL")}
      section="Valuation"
      setRoleAction={setRole}
      drawerOpen={false}
      askSuggestions={["What prevents sign-off?"]}
      askContext="FY2026 Inventory Close · Shell"
    >
      <main className="icg-workspace" />
    </AppShell>,
  );
}

describe("App shell — navigation and identity", () => {
  it("renders all fifteen destinations, grouped, with the badge and start-here tag", () => {
    renderShell();
    // Pinned against the canonical list, not against NAV_ITEMS itself —
    // iterating the source array would shrink with it and pass on deletion.
    // Cutoff and Ownership are deliberately absent: they were never screens,
    // and are now filters on /exceptions. See FOLDED_ROUTES.
    expect(NAV_ITEMS.map((s) => s.label)).toEqual([
      "Overview",
      "How to Explore",
      "Inventory",
      "Procurement",
      "Costing",
      "Physical Count",
      "Custody & Disposition",
      "Valuation",
      "Exceptions",
      "Evidence",
      "Reconciliation",
      "Adjustments",
      "Audit Package",
      "Methodology",
      "Close Memo",
    ]);
    // The grouping is pinned too, or a regression that flattened the rail
    // back into one column would pass on the labels alone.
    expect(NAV_SECTIONS.map((s) => s.title)).toEqual([
      "Start",
      "The Book",
      "Assertions",
      "The Close",
      "Output",
    ]);
    for (const s of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: new RegExp(s.label) })).toBeTruthy();
    }
    const exceptions = screen.getByRole("link", { name: /Exceptions/ });
    expect(exceptions.textContent).toContain("7");
    const guide = screen.getByRole("link", { name: /How to Explore/ });
    expect(guide.textContent).toContain("START HERE");
  });

  it("marks the active section for assistive tech", () => {
    renderShell();
    const active = screen.getByRole("link", { name: /Valuation/ });
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("always shows the synthetic-demo indicator and the period state", () => {
    renderShell();
    expect(screen.getByText("SYNTHETIC DEMO")).toBeTruthy();
    expect(screen.getByText("PERIOD OPEN")).toBeTruthy();
  });

  it("shows the acting demo user from the dataset, never invented names", () => {
    renderShell();
    expect(screen.getByText("M. Reyes")).toBeTruthy();
    expect(screen.getByText("Controller · Demo")).toBeTruthy();
  });
});

describe("App shell — every nav entry is a built screen", () => {
  /**
   * The placeholder problem, pinned so it cannot return: a rail entry that
   * leads to a "not designed yet" page (or to nothing at all) is worse than
   * no entry. This walks the real app directory rather than trusting a list.
   */
  it("resolves every nav href to a route file that exists", () => {
    const appDir = join(__dirname, "..", "app");
    for (const section of NAV_ITEMS) {
      const segment = section.href === "/" ? "" : section.href.replace(/^\//, "");
      const route = join(appDir, segment, "page.tsx");
      expect(existsSync(route), `${section.label} → ${section.href} (${route})`).toBe(true);
    }
  });

  it("keeps a route file behind every folded URL, so an old link redirects", () => {
    // /cutoff and /ownership left the rail; they must not have left the site.
    // A 404 on a publicly deployed URL is the defect this guards, and the
    // destinations are read from the same map the stubs redirect to.
    const appDir = join(__dirname, "..", "app");
    for (const [from, to] of Object.entries(FOLDED_ROUTES)) {
      const route = join(appDir, from.replace(/^\//, ""), "page.tsx");
      expect(existsSync(route), `${from} has no route file`).toBe(true);
      const src = readFileSync(route, "utf8");
      expect(src, `${from} does not redirect`).toContain("redirect");
      // The destination must be a filter this screen actually serves, not
      // just any string — a redirect to an unhandled filter would render the
      // unfiltered queue and silently lose the view.
      expect(to).toMatch(/^\/exceptions\?filter=(cutoff|ownership)$/);
    }
    // And nothing may quietly re-add them to the rail.
    expect(NAV_ITEMS.some((i) => i.href in FOLDED_ROUTES)).toBe(false);
  });

  it("ships no not-designed placeholder screen or catch-all section route", () => {
    const appDir = join(__dirname, "..", "app");
    expect(existsSync(join(appDir, "[section]", "page.tsx"))).toBe(false);
    expect(existsSync(join(__dirname, "..", "components", "NotDesignedScreen.tsx"))).toBe(false);
  });
});

describe("App shell — theme", () => {
  it("toggles the palette attribute and persists the choice", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "THEME" }));
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    await user.click(screen.getByRole("button", { name: "THEME" }));
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("light");
  });

  it("§4: the pre-paint bootstrap restores the persisted palette", () => {
    // The <head> script is the only thing standing between the demo and a
    // wrong-palette first frame, so run the real source, not a copy of it.
    document.documentElement.removeAttribute(THEME_ATTR);
    localStorage.setItem(THEME_KEY, "dark");
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("dark");

    document.documentElement.removeAttribute(THEME_ATTR);
    localStorage.removeItem(THEME_KEY);
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBeNull();
  });

  it("§4: the bootstrap and the toggle agree on the storage key", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    renderShell();
    await user.click(screen.getByRole("button", { name: "THEME" }));
    const written = localStorage.getItem(THEME_KEY);
    document.documentElement.removeAttribute(THEME_ATTR);
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe(written);
  });
});

describe("App shell — role selector", () => {
  it("lists every demo user and invokes the role action", async () => {
    const user = userEvent.setup();
    const setRole = vi.fn(async () => {});
    renderShell(setRole);
    await user.click(screen.getByRole("button", { name: /ROLE/ }));
    const options = screen.getAllByRole("menuitemradio");
    expect(options).toHaveLength(10);
    const auditor = options.find((o) => o.textContent?.includes("Auditor"));
    expect(auditor).toBeTruthy();
    await user.click(auditor!);
    expect(setRole).toHaveBeenCalledWith("U-009");
  });
});

describe("App shell — Ask Gaurd rail persistence", () => {
  it("reopens the drawer when it was left open", async () => {
    const user = userEvent.setup();
    const first = renderShell();
    await user.click(screen.getByRole("button", { name: "Ask Gaurd" }));
    expect(localStorage.getItem("icg-ask-open")).toBe("1");
    first.unmount();
    renderShell();
    // Persisted open state is restored on mount.
    expect(await screen.findByText("SUGGESTED")).toBeTruthy();
  });
});

/**
 * The shell is on all twenty routes, so whatever it reads it says everywhere.
 *
 * It read `getCloseReadiness` — the rules' frozen artifact — and printed the
 * result in two strings inside `.icg-header-kpis` and one badge on the nav
 * rail. Conclude one blocker and the Overview gate four inches below the
 * header read 6 while the header read "7 blockers"; /close-memo's own BLOCKERS
 * OPEN tile, already live, read 6 under a header reading 7; and the rail badge
 * read 7 beside a /exceptions?filter=blockers list of six rows.
 *
 * These tests must live below the ones above them: the workspace is a
 * process-global singleton and this file's earlier assertions are written
 * against the untouched baseline.
 */
describe("App shell — the header and the rail read the close as it is NOW", () => {
  afterEach(resetDemo);

  /**
   * The locked baseline, asserted at a fresh load. Nothing in this pass may
   * move any of these: live == baseline until somebody acts, and that
   * invariant is what makes every "after" assertion below mean something.
   */
  it("reports the rules' own figures before anyone has acted", () => {
    const shell = buildShellData(controller(), "T-SHELL-BASE");
    expect(shell.headerKpis?.blockers).toBe("7 blockers");
    expect(shell.headerKpis?.ready).toBe("81.4% ready");
    expect(shell.navOpenBlockers).toBe(7);

    const gate = buildOverviewData(controller(), "T-SHELL-BASE-OV").gate;
    expect(gate?.bps).toBe(8142);
    expect(gate?.blockerCount).toBe(7);
    expect(gate?.blockerExposure).toBe("$198,950 exposure");
  });

  it("drops with the close, and agrees with the gate it sits above", () => {
    // The premise. Without it the assertion below cannot tell a fix from a
    // fixture that never had seven in it.
    const before = buildShellData(controller(), "T-SHELL-BEFORE");
    expect(before.headerKpis?.blockers).toBe("7 blockers");
    expect(before.navOpenBlockers).toBe(7);

    concludeException("EXC-003");

    const after = buildShellData(controller(), "T-SHELL-AFTER");
    expect(after.headerKpis?.blockers).toBe("6 blockers");
    expect(after.navOpenBlockers).toBe(6);

    // The contradiction itself, in one process: the header and the figure
    // rendered directly beneath it.
    const gate = buildOverviewData(controller(), "T-SHELL-AFTER-OV").gate;
    expect(gate?.blockerCount).toBe(6);
    expect(after.headerKpis?.blockers).toBe(`${gate?.blockerCount} blockers`);
    expect(after.headerKpis?.ready).toBe(`${gate?.readinessOverview} ready`);
  });

  /**
   * The trap in making a figure live, found in the browser pass and fixed
   * here.
   *
   * `headerKpis.blockers` was `${n} blockers` — a hard-coded plural that was
   * correct by construction for exactly as long as this string was the rules'
   * constant seven. Making it live is what made a count of one reachable, so
   * the commit that fixed the header's figure would have shipped "1 blockers"
   * onto all twenty routes. That is the reopen pattern this repo has measured:
   * a fix that opens a class one row over. No baseline render can show it,
   * which is why this test drives the count to one first.
   */
  it("says '1 blocker', not '1 blockers', at a count of one", () => {
    expect(buildShellData(controller(), "T-SHELL-PLURAL-BASE").headerKpis?.blockers).toBe(
      "7 blockers",
    );

    resolveAllBut(1);

    const shell = buildShellData(controller(), "T-SHELL-PLURAL");
    expect(shell.headerKpis?.blockers).toBe("1 blocker");
    expect(shell.navOpenBlockers).toBe(1);
  });

  it("puts the live count on the rendered rail badge", () => {
    concludeException("EXC-003");
    renderShell();
    const exceptions = screen.getByRole("link", { name: /Exceptions/ });
    expect(exceptions.textContent).toContain("6");
    expect(exceptions.textContent).not.toContain("7");
  });
});
