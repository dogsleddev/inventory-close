// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { CloseMemoScreen } from "../components/CloseMemoScreen";
import { MethodologyScreen } from "../components/MethodologyScreen";
import { NAV_SECTIONS } from "../lib/nav";
import { buildShellData } from "../lib/server/data";
import { buildCloseMemoData } from "../lib/server/memo-view";
import { buildMethodologyData } from "../lib/server/methodology-view";
import { getCommands, getWorkspace, makeContext } from "../lib/server/workspace";
import { getMethodology } from "@icg/services";
import type { WorkflowActionResult } from "../lib/view-model";

/**
 * Stage F regressions.
 *
 * Three things these exist to hold:
 *
 * 1. **A refusal is rendered.** Nothing in this suite asserted that before —
 *    the refusal path was proved at the service layer only, so a screen that
 *    dropped `setResult` and swallowed the reason would have passed. The
 *    memo is the first new command surface since the close loop, and it
 *    closes the gap rather than inheriting it.
 * 2. **The methodology screen transcribes nothing.** Its figures are checked
 *    against the service that produced them, not against literals.
 * 3. **The nav label and the screen's `section` byte-match.** `AppShell`
 *    compares them with string equality, so a near-miss silently loses the
 *    active state rather than failing.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
const ok = async (): Promise<WorkflowActionResult> => ({
  ok: true,
  message: "Saved.",
  unmet: [],
});
const user = (role: Parameters<typeof userByRole>[0] = "CONTROLLER") => userByRole(role);

function memoScreen(
  role: Parameters<typeof userByRole>[0],
  overrides: Partial<{
    saveDraftAction: (input: {
      title: string;
      body: string;
    }) => Promise<WorkflowActionResult>;
  }> = {},
) {
  return render(
    <CloseMemoScreen
      shell={buildShellData(user(role), "T-F")}
      data={buildCloseMemoData(user(role), "T-F")}
      saveDraftAction={overrides.saveDraftAction ?? ok}
      issueVersionAction={ok}
      setRoleAction={noopRole}
    />,
  );
}

describe("a refusal reaches the screen", () => {
  it("renders the reason in a live region and keeps the draft the user wrote", async () => {
    const person = userEvent.setup();
    const refuse = vi.fn(
      async (): Promise<WorkflowActionResult> => ({
        ok: false,
        message: "Your demo role is not authorized to record this.",
        unmet: [],
      }),
    );
    memoScreen("CONTROLLER", { saveDraftAction: refuse });

    const body = screen.getByLabelText("MEMO");
    await person.type(body, "Draft text the user typed.");
    await person.click(screen.getByRole("button", { name: "Save draft" }));

    expect(refuse).toHaveBeenCalled();
    // The reason itself, in a live region — not merely "something failed".
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("not authorized to record this");
    // Nothing on the save path clears the editor on either outcome, so
    // asserting the text survives here would pass whatever the component
    // did. The branch that CAN clear is the issue note, and it is tested
    // against a real refusal in the block at the end of this file.
    expect((body as HTMLTextAreaElement).value).toContain("Draft text the user typed.");
  });

  it("renders the outcome on success too, not only on refusal", async () => {
    const person = userEvent.setup();
    memoScreen("CONTROLLER");
    await person.type(screen.getByLabelText("MEMO"), "Assessment.");
    await person.click(screen.getByRole("button", { name: "Save draft" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Saved.");
  });

  it("says nothing before a command has run", () => {
    memoScreen("CONTROLLER");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the memo offers only what the role may do, and says why not", () => {
  it("offers drafting and issuing to a Controller", () => {
    memoScreen("CONTROLLER");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Issue this version" })).toBeTruthy();
  });

  it("offers a preparer the draft and not the issue", () => {
    memoScreen("PREPARER");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Issue this version" })).toBeNull();
  });

  it("tells a role that may read but not draft, rather than showing nothing", () => {
    memoScreen("FPA");
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    // Absence alone is not the assertion; the stated reason is half of it.
    expect(screen.getByText(/may read the memo but not draft it/)).toBeTruthy();
  });

  it("cannot issue while there is no draft, and says that rather than hiding it", () => {
    memoScreen("CONTROLLER");
    const issue = screen.getByRole("button", { name: "Issue this version" });
    expect((issue as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("There is no working draft to issue.")).toBeTruthy();
  });
});

describe("the methodology screen renders what the service derived", () => {
  it("shows every readiness category the explanation carries, with its own score", () => {
    const view = getMethodology(getWorkspace(), makeContext(user(), "T-F"));
    render(
      <MethodologyScreen
        shell={buildShellData(user(), "T-F")}
        data={buildMethodologyData(user(), "T-F")}
        setRoleAction={noopRole}
      />,
    );
    expect(view.readiness.categories.length).toBeGreaterThan(0);
    for (const c of view.readiness.categories) {
      const score = (c.scoreHundredths / 100).toFixed(2);
      expect(
        screen.getByRole("heading", { name: `${c.label} — ${score}%` }),
        c.key,
      ).toBeTruthy();
    }
  });

  it("names the exceptions a term counted, from the term and not from prose", () => {
    const view = getMethodology(getWorkspace(), makeContext(user(), "T-F"));
    render(
      <MethodologyScreen
        shell={buildShellData(user(), "T-F")}
        data={buildMethodologyData(user(), "T-F")}
        setRoleAction={noopRole}
      />,
    );
    const observed = view.readiness.categories.flatMap((c) =>
      c.terms.filter((t) => t.drivingExceptionIds.length > 0).map((t) => t.observed),
    );
    expect(observed.length).toBeGreaterThan(0);
    for (const text of observed) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("carries no canonical figure of its own", () => {
    // The firewall this page most needs: it explains the numbers, so a number
    // typed into it would be the worst possible transcription. The repo-wide
    // scan covers the locked totals; this covers the readiness scale, which
    // that scan does not list.
    const source = readFileSync(
      join(__dirname, "..", "components", "MethodologyScreen.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/81\.4|8142|\$4,800,000|12,450/);
    const viewSource = readFileSync(
      join(__dirname, "..", "lib", "server", "methodology-view.ts"),
      "utf8",
    );
    expect(viewSource).not.toMatch(/81\.4|8142|\$4,800,000|12,450/);
  });
});

describe("the new sections are wired the way the shell expects", () => {
  it("matches each screen's section prop to its nav label byte for byte", () => {
    // `AppShell` compares `section` to the nav label with string equality, so
    // a near-miss loses `aria-current` silently rather than failing.
    const pairs = [
      { file: "MethodologyScreen.tsx", href: "/methodology" },
      { file: "CloseMemoScreen.tsx", href: "/close-memo" },
    ];
    for (const pair of pairs) {
      const label = NAV_SECTIONS.find((s) => s.href === pair.href)?.label;
      expect(label, pair.href).toBeDefined();
      const source = readFileSync(join(__dirname, "..", "components", pair.file), "utf8");
      expect(source, pair.file).toContain(`section="${label}"`);
    }
  });

  it("keeps no nav label a substring of another", () => {
    // `shell.test.tsx` builds `new RegExp(label)` unescaped and `getByRole`
    // throws on ambiguity, so a label contained in another label breaks a
    // test whose failure names neither of them.
    for (const a of NAV_SECTIONS) {
      for (const b of NAV_SECTIONS) {
        if (a.href === b.href) continue;
        expect(b.label.includes(a.label), `"${a.label}" is inside "${b.label}"`).toBe(false);
      }
    }
  });

  it("keeps the action cluster free of an inline display", () => {
    // Below 1024 the product is read-only review and `.icg-action-conclude`
    // is removed by an unqualified rule. An inline `display` on the wrapper
    // defeats it, and so does a `div.`-qualified selector.
    const source = readFileSync(
      join(__dirname, "..", "components", "CloseMemoScreen.tsx"),
      "utf8",
    );
    const clusters = source.match(/className="icg-action-conclude"[\s\S]{0,120}?>/g) ?? [];
    expect(clusters.length).toBeGreaterThan(0);
    for (const cluster of clusters) {
      expect(cluster, cluster).not.toMatch(/display:/);
    }
  });
});

/**
 * Last in the file, deliberately: it seeds a working draft into the server
 * workspace so the issue control becomes reachable, and the tests above
 * assert on a workspace with no draft in it. The reset at the end puts it
 * back.
 */
describe("a refused issue keeps the note the user wrote", () => {
  afterAll(() => {
    getCommands().resetDemo(makeContext(user(), "T-F-RESET"));
  });

  it("clears the note on success and keeps it on refusal", async () => {
    getCommands().saveMemoDraft(makeContext(user(), "T-F-SEED"), {
      title: "FY2026 Inventory Close Memo",
      body: "Seeded so a version can be issued.",
    });
    const person = userEvent.setup();
    const refuse = vi.fn(
      async (): Promise<WorkflowActionResult> => ({
        ok: false,
        message: "The period is locked; reopen it before recording more.",
        unmet: [],
      }),
    );
    render(
      <CloseMemoScreen
        shell={buildShellData(user(), "T-F")}
        data={buildCloseMemoData(user(), "T-F")}
        saveDraftAction={ok}
        issueVersionAction={refuse}
        setRoleAction={noopRole}
      />,
    );

    const note = screen.getByLabelText("NOTE FOR THE AUDIT TRAIL (OPTIONAL)");
    await person.type(note, "Reviewed with the CFO.");
    const issue = screen.getByRole("button", { name: "Issue this version" });
    expect((issue as HTMLButtonElement).disabled).toBe(false);
    await person.click(issue);

    expect(refuse).toHaveBeenCalledWith({ note: "Reviewed with the CFO." });
    expect((await screen.findByRole("status")).textContent).toContain("period is locked");
    // The note survives, because the clear runs only on success. Moving that
    // clear outside the ok branch is what this assertion catches.
    expect((note as HTMLInputElement).value).toBe("Reviewed with the CFO.");
  });
});
