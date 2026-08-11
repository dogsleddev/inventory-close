// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { userByRole } from "@icg/data";
import { AppShell } from "../components/AppShell";
import { buildShellData } from "../lib/server/data";
import { NAV_SECTIONS } from "../lib/nav";
import { THEME_ATTR, THEME_BOOTSTRAP, THEME_KEY } from "../lib/theme";

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
  it("renders all fifteen sections with the blocker badge and start-here tag", () => {
    renderShell();
    // Pinned against the canonical list, not against NAV_SECTIONS itself —
    // iterating the source array would shrink with it and pass on deletion.
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Overview",
      "Inventory",
      "Procurement",
      "Costing",
      "Physical Count",
      "Cutoff",
      "Ownership",
      "Custody & Disposition",
      "Valuation",
      "Exceptions",
      "Evidence",
      "Reconciliation",
      "Adjustments",
      "Audit Package",
      "How to Explore",
    ]);
    for (const s of NAV_SECTIONS) {
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
    for (const section of NAV_SECTIONS) {
      const segment = section.href === "/" ? "" : section.href.replace(/^\//, "");
      const route = join(appDir, segment, "page.tsx");
      expect(existsSync(route), `${section.label} → ${section.href} (${route})`).toBe(true);
    }
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
