// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import {
  COST_COMPONENT_TYPES,
  PHYSICAL_CUSTODY_TYPES,
  type PhysicalCustodyType,
} from "@icg/domain";
import { CUSTODY_LABELS } from "../lib/server/inventory-list-view";
import { buildCostingData } from "../lib/server/costing-view";
import { buildCustodyData } from "../lib/server/custody-view";
import { buildInventoryListData } from "../lib/server/inventory-list-view";
import { formatBpsExact, formatCents } from "../lib/format";
import { CloseMemoScreen } from "../components/CloseMemoScreen";
import { MethodologyScreen } from "../components/MethodologyScreen";
import { NAV_SECTIONS } from "../lib/nav";
import { buildShellData } from "../lib/server/data";
import { buildCloseMemoData } from "../lib/server/memo-view";
import { buildMethodologyData } from "../lib/server/methodology-view";
import { getCommands, getWorkspace, makeContext } from "../lib/server/workspace";
import { getMemo, getMethodology } from "@icg/services";
import { buildCsv } from "../lib/server/export-csv";
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
      // The app's own formatter, not an inline copy of it. The inline copy
      // that used to be here is why a duplicate helper in the view module
      // survived review: the test agreed with the duplicate, not with the app.
      expect(
        screen.getByRole("heading", {
          name: `${c.label} — ${formatBpsExact(c.scoreHundredths)}`,
        }),
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

  it("spells no category count into its prose either", () => {
    // The sibling above scans for DIGITS, which is why "Eight weighted
    // categories" survived it. A count spelled as a word is the same
    // transcription: it goes stale the moment the policy gains a category,
    // and nothing derives it.
    //
    // Scoped to these two files on purpose — OverviewScreen.tsx:143's "Eight
    // weighted close areas" is stage-05 copy pinned by a test NAME, and is
    // not this page's claim to make.
    const SPELLED_COUNT =
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(weighted\s+categor|weights\b|categories\b)/i;
    for (const rel of [
      ["..", "components", "MethodologyScreen.tsx"],
      ["..", "lib", "server", "methodology-view.ts"],
    ]) {
      const text = readFileSync(join(__dirname, ...rel), "utf8");
      expect(SPELLED_COUNT.test(text), `${rel.at(-1)} spells a category count`).toBe(false);
    }
  });

  it("heads the penalty column with the quantity its cells carry", () => {
    const view = getMethodology(getWorkspace(), makeContext(user(), "T-F"));
    render(
      <MethodologyScreen
        shell={buildShellData(user(), "T-F")}
        data={buildMethodologyData(user(), "T-F")}
        setRoleAction={noopRole}
      />,
    );
    // Exact-name matching, so "Effect on the ledger" on the reconciliation
    // table is correctly not counted here.
    expect(
      screen.getAllByRole("columnheader", { name: "Deduction" }),
    ).toHaveLength(view.readiness.categories.length);
    expect(screen.queryAllByRole("columnheader", { name: "Effect" })).toHaveLength(0);

    for (const c of view.readiness.categories) {
      for (const t of c.terms) {
        const cell = t.penaltyPercent === 0 ? "No deduction" : `−${t.penaltyPercent} points`;
        expect(screen.getAllByText(cell).length, `${c.key}: ${t.rule}`).toBeGreaterThan(0);
      }
    }

    // The teeth: a category scoring below full while deducting nothing is
    // exactly why the column cannot be headed "Effect" — those cells read
    // "No deduction" and the category is still dragging the total down.
    const silentDrag = view.readiness.categories.filter(
      (c) => c.scoreHundredths < 10000 && c.terms.every((t) => t.penaltyPercent === 0),
    );
    expect(
      silentDrag.length,
      "no category scores below full without a deduction; the header question is moot",
    ).toBeGreaterThan(0);
  });
});

describe("the two new export files carry the values their labels name", () => {
  /**
   * Stage F added ~318 lines of export builder and no assertion on a single
   * value in either file. Row counts, provenance strings and quoting are all
   * invariant under a transposition, so swapping two figures would have
   * shipped. These loops drive from the SERVICE, never from literals — a
   * literal here would duplicate the baseline `no-hardcoded-totals` exists to
   * keep out of the app, and would pass a swap that moved a figure the file
   * also carries elsewhere.
   */
  const csv = (table: "methodology" | "close-memo") =>
    buildCsv(user(), table, "T-F-CSV").body;

  /** The value in the cell to the right of `label`, on the row that heads it. */
  const valueFor = (body: string, label: string): string | null => {
    const line = body.split("\r\n").find((l) => l.startsWith(`"${label}",`));
    if (line === undefined) return null;
    return line.split('","')[1]?.replace(/"$/, "") ?? null;
  };

  it("resolves every reconciliation cell in the methodology file to its service field", () => {
    const m = getMethodology(getWorkspace(), makeContext(user(), "T-F-CSV"));
    const body = csv("methodology");
    const bridge: ReadonlyArray<readonly [string, string]> = [
      ["Subledger", formatCents(m.reconciliation.subledgerCents)],
      ["Gross general ledger", formatCents(m.reconciliation.grossGlCents)],
      ["Difference", formatCents(m.reconciliation.differenceCents)],
      ["Unexplained", formatCents(m.reconciliation.unexplainedCents)],
    ];
    for (const [label, expected] of bridge) {
      expect(valueFor(body, label), `${label} in the methodology file`).toBe(expected);
    }
    // A transposition is only visible where two values differ, so the loop is
    // only meaningful while they do.
    const values = bridge.map(([, v]) => v);
    expect(new Set(values).size, "two bridge figures coincide; a swap would be invisible").toBe(
      values.length,
    );
  });

  it("keeps the readiness figure numeric and names its unit in the label", () => {
    const m = getMethodology(getWorkspace(), makeContext(user(), "T-F-CSV"));
    const body = csv("methodology");
    // The cell sits under a "Weighted contribution" header and is not one, so
    // the unit has to travel with it — but as a label, because the bare
    // integer is what makes the division checkable in a spreadsheet.
    const line = body.split("\r\n").find((l) => l.startsWith('"Close readiness'));
    expect(line, "no close-readiness row in the methodology file").toBeDefined();
    expect(line!).toMatch(/\((basis points|bps)\)/);
    expect(line!).toContain(`"${m.readiness.totalBasisPoints}"`);
  });

  it("resolves the close-memo position cells to the service that derived them", () => {
    const memo = getMemo(getWorkspace(), makeContext(user(), "T-F-CSV"));
    const body = csv("close-memo");
    // `Exceptions open` and `Blockers` are BOTH 7 at this baseline, so
    // transposing those two is invisible to any assertion of this shape.
    // They are checked here for presence; the pairs below are what a swap
    // would actually break.
    const cells: ReadonlyArray<readonly [string, string]> = [
      ["Inventory subledger", formatCents(memo.position.subledgerCents)],
      [
        "Gross inventory in the general ledger",
        formatCents(memo.position.grossGlCents),
      ],
      ["Difference", formatCents(memo.position.differenceCents)],
      ["Blocker exposure", formatCents(memo.position.blockerExposureCents)],
      ["Close readiness (basis points)", String(memo.position.readinessBps)],
    ];
    for (const [label, expected] of cells) {
      expect(valueFor(body, label), `${label} in the close-memo file`).toBe(expected);
    }
    const values = cells.map(([, v]) => v);
    expect(new Set(values).size, "two position figures coincide").toBe(values.length);
  });

  it("emits every section heading as a boundary the splitter can find", () => {
    // The regex is copied byte-for-byte from stageE-regressions.test.tsx — its
    // character class contains an em dash, and substituting a hyphen silently
    // narrows it so the assertion passes without testing anything.
    const boundary = /\r\n"[A-Z][A-Z ()/—-]{6,}"\r\n/g;
    // Named, not counted. A count is satisfied by the wrong set of the right
    // size: rename one heading so the splitter stops seeing it and a total
    // stays plausible, while the section it heads silently merges into its
    // neighbour. A named list also catches a heading deleted outright, which
    // nothing derived from the file itself can.
    const headings = {
      methodology: [
        "READINESS DERIVATION",
        "SUBLEDGER TO GENERAL LEDGER",
        "RECONCILING ITEMS",
        "INVENTORY ACCOUNTING MATRIX",
        "MATRIX ROWS",
        "AUTHORED JUDGEMENTS",
        "POLICY VALUES",
        "NOT COVERED BY THE REPRODUCIBILITY CHECK",
      ],
      "close-memo": ["CLOSE POSITION THIS MEMO DESCRIBES", "VERSION HISTORY", "ISSUED TEXT"],
    } as const;

    for (const table of ["methodology", "close-memo"] as const) {
      const body = csv(table);
      const found = new Set((body.match(boundary) ?? []).map((m) => m.slice(3, -3)));
      for (const heading of headings[table]) {
        expect(body, `${table}: ${heading} is not emitted at all`).toContain(heading);
        expect(
          found.has(heading),
          `${table}: "${heading}" is emitted but the splitter does not see it as a boundary`,
        ).toBe(true);
      }
    }
  });
});

describe("one enum value, one rendered string, wherever a screen names it", () => {
  /**
   * Screens only. Every CSV export deliberately carries the canonical enum
   * value (export-csv.ts passes `custodyType` through untouched), because an
   * export is where the canonical value has to survive. Adding the exporters
   * here would not find a defect, it would demand one.
   */
  it("renders every physical custody type the same way on every screen that names it", () => {
    const u = user();
    const methodology = buildMethodologyData(u, "T-F-LABELS");
    const custody = buildCustodyData(u, "T-F-LABELS");
    const inventory = buildInventoryListData(u, {}, "T-F-LABELS");
    expect(methodology.interpretations, "the register is restricted").not.toBeNull();
    expect(custody.custody, "the custody tab is restricted").not.toBeNull();

    // The vocabulary itself is not pinned — renaming a label in CUSTODY_LABELS
    // must stay green. What is pinned is that every screen speaks it.
    const vocabulary = new Set(PHYSICAL_CUSTODY_TYPES.map((t) => CUSTODY_LABELS[t]));

    // The register's SUBJECT column is the surface that was wrong: it routed
    // custody types through the classification humanizer, so one row read
    // "Repair Rma Hold" in the subject and "Repair / RMA hold" in the answer.
    const registerRows = methodology.interpretations!.rows.filter((r) =>
      r.id.startsWith("CUSTODY_HOLDER:"),
    );
    expect(registerRows, "the register contributed no custody rows").toHaveLength(
      PHYSICAL_CUSTODY_TYPES.length,
    );
    for (const row of registerRows) {
      const type = row.id.slice("CUSTODY_HOLDER:".length) as PhysicalCustodyType;
      expect(row.subject, `${type} in the register's subject column`).toBe(
        CUSTODY_LABELS[type],
      );
    }

    // ...and no other screen may invent a rendering outside that vocabulary.
    const elsewhere = [
      ...custody.custody!.rows.map((r) => r.custody),
      ...inventory.rows.map((r) => r.custody),
    ];
    expect(elsewhere.length, "no screen contributed a custody label").toBeGreaterThan(0);
    for (const label of elsewhere) {
      expect(vocabulary, `"${label}" is a custody rendering no other screen uses`).toContain(
        label,
      );
    }
  });

  it("renders every cost component the same way on the register and the cost stack", () => {
    const u = user();
    const methodology = buildMethodologyData(u, "T-F-LABELS");
    const costing = buildCostingData(u, "T-F-LABELS");

    const fromRegister = new Map<string, string>();
    expect(methodology.interpretations, "the register is restricted").not.toBeNull();
    expect(costing.stack, "the cost stack is restricted").not.toBeNull();
    for (const row of methodology.interpretations!.rows) {
      const [dimension, type] = row.id.split(":");
      if (dimension !== "COST_BEHAVIOR" || type === undefined) continue;
      fromRegister.set(type, row.subject);
    }
    expect(fromRegister.size, "the register contributed no cost-component rows").toBe(
      COST_COMPONENT_TYPES.length,
    );

    const onStack = new Set(costing.stack!.componentColumns);
    for (const [, label] of fromRegister) {
      expect(onStack, `${label} is not the label the cost stack uses`).toContain(label);
    }
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
describe("the issue note survives a refusal and clears on success", () => {
  afterAll(() => {
    getCommands().resetDemo(makeContext(user(), "T-F-RESET"));
  });

  it("keeps the note the user wrote when the issue is refused", async () => {
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

  it("clears the note when the issue succeeds", async () => {
    // The other half of the contract. One branch alone cannot distinguish a
    // conditional clear from an absent one: without this, deleting the
    // `() => setIssueNote("")` argument entirely leaves the suite green.
    getCommands().saveMemoDraft(makeContext(user(), "T-F-SEED-OK"), {
      title: "FY2026 Inventory Close Memo",
      body: "Seeded so a version can be issued.",
    });
    const person = userEvent.setup();
    const succeed = vi.fn(
      async (): Promise<WorkflowActionResult> => ({
        ok: true,
        message: "Version issued.",
        unmet: [],
      }),
    );
    render(
      <CloseMemoScreen
        shell={buildShellData(user(), "T-F")}
        data={buildCloseMemoData(user(), "T-F")}
        saveDraftAction={ok}
        issueVersionAction={succeed}
        setRoleAction={noopRole}
      />,
    );

    const note = screen.getByLabelText("NOTE FOR THE AUDIT TRAIL (OPTIONAL)");
    await person.type(note, "Reviewed with the CFO.");
    await person.click(screen.getByRole("button", { name: "Issue this version" }));

    expect(succeed).toHaveBeenCalledWith({ note: "Reviewed with the CFO." });
    expect((await screen.findByRole("status")).textContent).toContain("Version issued.");
    expect((note as HTMLInputElement).value).toBe("");
  });

  it("will not issue what is not on screen, and says why", async () => {
    getCommands().saveMemoDraft(makeContext(user(), "T-F-SEED-DIRTY"), {
      title: "FY2026 Inventory Close Memo",
      body: "The saved draft of record.",
    });
    const person = userEvent.setup();
    const issue = vi.fn(
      async (): Promise<WorkflowActionResult> => ({ ok: true, message: "x", unmet: [] }),
    );
    render(
      <CloseMemoScreen
        shell={buildShellData(user(), "T-F")}
        data={buildCloseMemoData(user(), "T-F")}
        saveDraftAction={ok}
        issueVersionAction={issue}
        setRoleAction={noopRole}
      />,
    );

    const button = () => screen.getByRole("button", { name: "Issue this version" });
    expect((button() as HTMLButtonElement).disabled).toBe(false);

    // Editing the BODY away from the draft of record.
    const body = screen.getByLabelText("MEMO");
    await person.type(body, " and an unsaved afterthought");
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/unsaved changes/)).toBeTruthy();
    await person.click(button());
    expect(issue, "issuing a draft the reader is not looking at").not.toHaveBeenCalled();

    // Typing it back — not saving: a fake saveDraftAction never writes the
    // workspace, so re-enabling has to come from the comparison itself.
    await person.clear(body);
    await person.type(body, "The saved draft of record.");
    expect((button() as HTMLButtonElement).disabled).toBe(false);

    // ...and the TITLE is half of what gets sealed, so it counts too.
    await person.type(screen.getByLabelText("TITLE"), " (revised)");
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not call whitespace an edit the reader has to save away", async () => {
    // The screen's OWN recommended path: "Start from the close position",
    // then "Save draft". The suggested body ends in a newline and the command
    // stores it trimmed, so a guard comparing raw keystrokes against the draft
    // of record finds a difference no amount of saving can clear — refusing a
    // control the service would accept, which is the mirror of the defect this
    // guard exists to prevent.
    //
    // Seeded through the real command rather than from a literal: a
    // hand-written trimmed body is exactly what let this ship.
    const person = userEvent.setup();
    const ctx = () => makeContext(user(), "T-F-WS");
    const save = async (input: { title: string; body: string }) => {
      getCommands().saveMemoDraft(ctx(), input);
      return { ok: true, message: "Saved.", unmet: [] } as WorkflowActionResult;
    };

    const first = buildCloseMemoData(user(), "T-F-WS");
    // Non-vacuity: if the offered text ever stops carrying trailing
    // whitespace, this case proves nothing and must say so.
    expect(
      first.suggestedBody,
      "the suggested body no longer carries trailing whitespace",
    ).not.toBe(first.suggestedBody.trim());

    const view = render(
      <CloseMemoScreen
        shell={buildShellData(user(), "T-F-WS")}
        data={first}
        saveDraftAction={save}
        issueVersionAction={ok}
        setRoleAction={noopRole}
      />,
    );

    await person.click(screen.getByRole("button", { name: "Start from the close position" }));
    await person.click(screen.getByRole("button", { name: "Save draft" }));

    // What `revalidatePath` produces: the same mounted root, fresh server data.
    view.rerender(
      <CloseMemoScreen
        shell={buildShellData(user(), "T-F-WS")}
        data={buildCloseMemoData(user(), "T-F-WS")}
        saveDraftAction={save}
        issueVersionAction={ok}
        setRoleAction={noopRole}
      />,
    );

    const issue = screen.getByRole("button", { name: "Issue this version" });
    expect(
      (issue as HTMLButtonElement).disabled,
      "saved its own suggested text and still refuses to issue it",
    ).toBe(false);
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
  });

  it("re-seeds the editor when the draft it was seeded from arrives late", async () => {
    // An auditor is not shown the working draft, and switching role is a props
    // update rather than a remount — so the editor keeps its mount-time
    // placeholder while `data.draft` holds the real one. Left alone, the guard
    // reports the placeholder as this reader's unsaved edits and instructs
    // them to save it over the draft of record.
    getCommands().saveMemoDraft(makeContext(user(), "T-F-SEED-LATE"), {
      title: "FY2026 Inventory Close Memo",
      body: "The controller's saved assessment.",
    });

    const asRole = (role: Parameters<typeof userByRole>[0]) => (
      <CloseMemoScreen
        shell={buildShellData(user(role), "T-F-LATE")}
        data={buildCloseMemoData(user(role), "T-F-LATE")}
        saveDraftAction={ok}
        issueVersionAction={ok}
        setRoleAction={noopRole}
      />
    );

    const view = render(asRole("AUDITOR_READ_ONLY"));
    view.rerender(asRole("CONTROLLER"));

    expect((screen.getByLabelText("MEMO") as HTMLTextAreaElement).value).toBe(
      "The controller's saved assessment.",
    );
    expect(
      (screen.getByRole("button", { name: "Issue this version" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("keeps what the reader typed when the draft changes underneath them", async () => {
    // The other half: re-seeding must never discard the reader's own words.
    // Mounted with no draft (so the editor is seeded empty), the reader types,
    // and a draft then arrives — a naive unconditional re-seed would wipe what
    // they wrote.
    const person = userEvent.setup();
    getCommands().resetDemo(makeContext(user(), "T-F-KEEP-RESET"));

    const current = () => (
      <CloseMemoScreen
        shell={buildShellData(user(), "T-F-KEEP")}
        data={buildCloseMemoData(user(), "T-F-KEEP")}
        saveDraftAction={ok}
        issueVersionAction={ok}
        setRoleAction={noopRole}
      />
    );

    const view = render(current());
    await person.type(screen.getByLabelText("MEMO"), "Words the reader typed.");

    // Somebody else saves a draft; this reader's props update underneath them.
    getCommands().saveMemoDraft(makeContext(user("ACCOUNTING_MANAGER"), "T-F-KEEP-OTHER"), {
      title: "FY2026 Inventory Close Memo",
      body: "Another author's assessment.",
    });
    view.rerender(current());

    expect((screen.getByLabelText("MEMO") as HTMLTextAreaElement).value).toContain(
      "Words the reader typed.",
    );
  });
});
