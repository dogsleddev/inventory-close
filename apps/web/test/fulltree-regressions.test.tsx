// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { userByRole } from "@icg/data";
import { OverviewScreen } from "../components/OverviewScreen";
import { NAV_ITEMS } from "../lib/nav";
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

/* ------------------------------------------------------------------ */
/* Stage 10 — below 1024px the workspace must survive an open drawer   */
/* ------------------------------------------------------------------ */

describe("a drawer never consumes the whole small screen", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");
  const smallBlock = /@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/.exec(css);

  it("has a <1024 block that takes the drawers out of the flex row", () => {
    expect(smallBlock, "the max-width:1023px block is missing").not.toBeNull();
    // As a static flex sibling, .icg-drawer is 320-340px of a 375px row —
    // it left the workspace 0px wide, so the page was not degraded, it was
    // blank. Overlaying is what keeps the content readable.
    expect(smallBlock?.[1] ?? "").toMatch(/\.icg-drawer\s*\{[^}]*position:\s*fixed/);
  });

  it("keeps every drawer variant inside the viewport", () => {
    expect(smallBlock).not.toBeNull();
    // A fixed drawer wider than the screen would push the body sideways.
    const widths = [
      ...(smallBlock?.[1] ?? "").matchAll(/\.icg-drawer[\w-]*\s*\{[^}]*width:\s*([^;]+);/g),
    ].map((m) => (m[1] ?? "").trim());
    expect(widths.length).toBeGreaterThan(0);
    for (const width of widths) {
      expect(width, `drawer width "${width}" is not viewport-bounded`).toMatch(/min\(/);
      expect(width).toMatch(/100vw|100%/);
    }
  });

  it("leaves the desktop layout alone — the drawer stays in the row above 1024", () => {
    // The base rule must not itself be fixed: at >=1024 the workspace
    // narrows once and the drawer sits beside it (handoff §4).
    const base = /\n\.icg-drawer \{([\s\S]*?)\n\}/.exec(css);
    expect(base, "base .icg-drawer rule is missing").not.toBeNull();
    expect(base?.[1] ?? "").not.toMatch(/position:\s*fixed/);
  });
});

/* ------------------------------------------------------------------ */
/* Stage 10 verification-fleet regressions                             */
/* ------------------------------------------------------------------ */

describe("the read-only rule cannot be defeated from inline styles", () => {
  // .icg-action-conclude { display: none } below 1024 REMOVES the
  // conclusion / evidence-request actions (handoff §5). An inline `display`
  // outranks it silently — jsdom cannot see media queries, so this pins the
  // mechanism: no action cluster may carry inline display, on any screen.
  it("renders every conclusion action cluster without an inline display", async () => {
    const { ExceptionDetailScreen } = await import("../components/ExceptionDetailScreen");
    const { buildExceptionDetailData } = await import("../lib/server/data");
    const user = userByRole("CONTROLLER");
    render(
      <ExceptionDetailScreen
        shell={buildShellData(user, "T-FTR")}
        data={buildExceptionDetailData(user, "EXC-001", "T-FTR")}
        setRoleAction={noopRole}
      />,
    );
    renderOverview();
    const clusters = document.querySelectorAll(".icg-action-conclude");
    expect(clusters.length).toBeGreaterThan(0);
    for (const el of clusters) {
      expect(
        (el as HTMLElement).style.display,
        "an inline display on .icg-action-conclude outranks the <1024 read-only rule",
      ).toBe("");
    }
  });

  it("keeps the display in the stylesheet, under the read-only override on file order", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");
    // UNQUALIFIED both times: a div- or button-qualified base rule would
    // out-specify the media override and defeat it the way the inline
    // style did — the first fix here shipped exactly that bug.
    expect(css).toMatch(/\n\.icg-action-conclude\s*\{\s*display:\s*flex/);
    expect(css).not.toMatch(/[a-z]\.icg-action-conclude\s*\{[^}]*display/);
    const small = /@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(small).toMatch(/\.icg-action-conclude\s*\{\s*display:\s*none/);
    // And the override must come LATER in the file, or order cannot save it.
    expect(css.indexOf("@media (max-width: 1023px)")).toBeGreaterThan(
      css.search(/\n\.icg-action-conclude\s*\{/),
    );
  });
});

describe("every wide band collapses below 1024", () => {
  // The bands that clipped to zero-width tracks at phone widths. A new wide
  // band belongs in this list — the ≤1023 block is the contract that no
  // grid resolves its content to 0px on a phone.
  const MUST_COLLAPSE = [
    ".icg-gate",
    ".icg-three-layer",
    ".icg-layer-facts",
    ".icg-kpis",
    ".icg-kpis--quad",
    ".icg-kpis--narrow",
    ".icg-chain",
  ];

  it("names each band inside the max-width:1023px block", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");
    const small = /@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(small.length).toBeGreaterThan(0);
    for (const selector of MUST_COLLAPSE) {
      expect(small, `${selector} has no <1024 collapse rule`).toContain(selector);
    }
  });

  it("keeps workspace splits collapsible: ratio only ever inline, via the variable", () => {
    // An inline gridTemplateColumns with a px track cannot be collapsed by
    // any stylesheet rule — the exact defect the exception screen shipped.
    const componentsDir = join(import.meta.dirname, "..", "components");
    for (const file of readdirSync(componentsDir).filter((f) => f.endsWith(".tsx"))) {
      const text = readFileSync(join(componentsDir, file), "utf8");
      for (const m of text.matchAll(/gridTemplateColumns:\s*("[^"]*"|[^,\n]*)/g)) {
        // Threshold, not a blanket ban: a 112-190px label beside a value
        // reads fine even in a 319px phone workspace. What starves content
        // is 240px+ of fixed track — the shipped defects were 300px, 340px,
        // and a 280px pair.
        const fixed = [...(m[1] ?? "").matchAll(/(\d+)px/g)]
          .map((px) => Number(px[1]))
          .reduce((a, b) => a + b, 0);
        expect(
          fixed >= 240,
          `${file}: ${fixed}px of fixed inline grid track cannot be collapsed by any breakpoint — use a class with a <1024 rule`,
        ).toBe(false);
      }
    }
  });
});

describe("the collapsed nav rail keeps its accessible names", () => {
  it("never removes .icg-nav-label from the accessibility tree", () => {
    const css = readFileSync(join(import.meta.dirname, "..", "app", "icg.css"), "utf8");
    // display:none on the label made every nav link nameless below 1280
    // (WCAG 4.1.2). The label may leave the LAYOUT (clip pattern) only.
    for (const m of css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) {
      const block = m[1] ?? "";
      const label = /\.icg-nav-label[^{}]*\{([^}]*)\}/.exec(block)?.[1];
      if (label !== undefined) {
        expect(label, "nav label display:none removes the link names").not.toMatch(
          /display:\s*none/,
        );
        expect(label).toMatch(/clip-path|clip:/);
      }
    }
  });

  it("gives every nav link a non-empty accessible name at the base layout", () => {
    renderOverview();
    const nav = document.querySelector(".icg-rail-nav");
    expect(nav).not.toBeNull();
    const links = nav!.querySelectorAll("a");
    expect(links.length).toBe(NAV_ITEMS.length);
    for (const link of links) {
      const label = link.querySelector(".icg-nav-label");
      expect(label?.textContent?.trim(), "a nav link with no label text").toBeTruthy();
    }
  });
});
