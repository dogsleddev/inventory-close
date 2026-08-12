import { afterEach, describe, expect, it } from "vitest";
import { userByRole } from "@icg/data";
import { buildCsv, MEMO_NO_VERSION_LINE } from "../lib/server/export-csv";
import { buildCloseMemoData } from "../lib/server/memo-view";
import { getCommands, getWorkspace, makeContext } from "../lib/server/workspace";

/**
 * The close-memo file is the artifact an auditor keeps, and it is the one
 * surface whose withholding is CONDITIONAL — it narrows only when an unissued
 * draft exists. Everything here is about the two claims that condition makes
 * possible: an absence stated from the viewer's scope rather than from the
 * population, and a completeness claim wider than what the file carries.
 *
 * It lives in its own file deliberately. Seeding a draft into the module
 * singleton breaks export-affordance.test.tsx's auditor/controller row-count
 * loop (close-memo becomes narrower while carrying no scope note) and
 * stageF-regressions.test.tsx's "cannot issue while there is no draft".
 */

const auditor = () => userByRole("AUDITOR_READ_ONLY");
const controller = () => userByRole("CONTROLLER");

const csvFor = (user: ReturnType<typeof controller>): string =>
  buildCsv(user, "close-memo", "T-MEMO-SCOPE").body;

const linesOf = (body: string): string[] => body.split("\r\n");

/** The truth, read from the workspace rather than from the exporter. */
const unscopedVersionCount = (): number => getWorkspace().memoVersions.length;

const seedDraft = (): void => {
  getCommands().saveMemoDraft(makeContext(controller(), "T-MEMO-SEED"), {
    title: "Year-end inventory close",
    body: "Management's assessment of the year-end inventory position.",
  });
};

afterEach(() => {
  getCommands().resetDemo(makeContext(controller(), "T-MEMO-RESET"));
});

describe("the close-memo file states an absence from the population, not from the view", () => {
  it("carries the absence line iff no memo exists at all, for every role", () => {
    // Baseline: nothing drafted. Both roles must state it.
    expect(unscopedVersionCount()).toBe(0);
    for (const user of [auditor(), controller()]) {
      expect(
        csvFor(user).includes(MEMO_NO_VERSION_LINE),
        `${user.roles[0]} at baseline`,
      ).toBe(unscopedVersionCount() === 0);
    }

    seedDraft();

    // A draft exists. It is withheld from the auditor and visible to the
    // Controller — and NEITHER file may now say the memo was never drafted.
    expect(unscopedVersionCount()).toBe(1);
    for (const user of [auditor(), controller()]) {
      expect(
        csvFor(user).includes(MEMO_NO_VERSION_LINE),
        `${user.roles[0]} with a draft in the workspace`,
      ).toBe(unscopedVersionCount() === 0);
    }
  });

  it("gives the auditor the withholding and no empty version table", () => {
    seedDraft();
    const body = csvFor(auditor());
    expect(body).toMatch(/unissued draft/);
    // A column header with no rows under it is the same over-claim, one row
    // smaller: it says a table of versions follows, and none does.
    expect(body).not.toContain('"Version","State","Lock"');

    const controllerBody = csvFor(controller());
    expect(controllerBody).toContain('"Version","State","Lock"');
    expect(controllerBody).not.toMatch(/unissued draft/);
  });
});

describe("one withholding, one wording", () => {
  it("the file states it in the screen's words, exactly", () => {
    seedDraft();
    const note = buildCloseMemoData(auditor(), "T-MEMO-SCREEN").withheldNote;
    expect(note, "the auditor must be withholding something").not.toBeNull();

    // An equality between two live surfaces, so it cannot go stale when the
    // copy is revised — only when the two stop sharing a source.
    expect(linesOf(csvFor(auditor()))).toContain(`"Withheld","${note!}"`);

    // A sentence that has just stated a count must not then hedge it.
    expect(note!).not.toContain("(s)");
  });
});

describe("what the file claims to show in full, it shows in full", () => {
  it("makes no completeness claim wider than the bodies it carries", () => {
    seedDraft();
    const commands = getCommands();
    const ctx = makeContext(controller(), "T-MEMO-ISSUE");
    commands.issueMemoVersion(ctx, {});
    // A second issued version supersedes the first. One version cannot
    // distinguish the two readings of "shown in full"; two can.
    commands.saveMemoDraft(ctx, {
      title: "Year-end inventory close (revised)",
      body: "Revised assessment following the reconciliation review.",
    });
    commands.issueMemoVersion(ctx, {});
    // ...and an unissued draft on top, which must appear in neither surface.
    commands.saveMemoDraft(ctx, {
      title: "Working notes",
      body: "UNISSUEDDRAFTBODYMARKER not for circulation.",
    });

    const sealedBodies = getWorkspace()
      .memoVersions.filter((v) => v.sealed)
      .map((v) => v.body);
    expect(sealedBodies.length, "the fixture must hold two sealed versions").toBe(2);

    const issuedBody = getWorkspace().memoVersions.find((v) => v.state === "ISSUED")!.body;

    for (const surface of [csvFor(auditor()), csvFor(controller())]) {
      // Derived from the population rather than gated on one phrase. The
      // earlier form guarded the assertion behind "does the file carry every
      // sealed body", which is false on every run — so the only live check was
      // a regex for wording this commit had already replaced, and it could
      // never fail.
      for (const withheld of sealedBodies.filter((b) => b !== issuedBody)) {
        expect(surface, "a superseded version's text is carried in the file").not.toContain(
          withheld,
        );
      }
      expect(
        surface,
        "a completeness claim wider than the bodies the file carries",
      ).not.toMatch(/\b(?:versions|every|all|each)\b[^.]*\bin full\b/i);
      // The unissued draft's text is management working paper on every path.
      expect(surface).not.toContain("UNISSUEDDRAFTBODYMARKER");
    }

    // ...and the note names the convention the file actually follows. Auditor
    // only: `withheldNote` is null when nothing is withheld, so a Controller's
    // file has never carried a completeness claim to check.
    expect(csvFor(auditor())).toMatch(/not its text/);
  });
});
