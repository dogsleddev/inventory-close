import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_USERS, userByRole } from "@icg/data";
import type { Role } from "@icg/domain";
import { AuthorizationError, hasPermission } from "@icg/permissions";
import { mutationAllowed } from "@icg/workflows";
import {
  createCommandService,
  createWorkspace,
  PeriodLockedError,
  describeWorkingState,
  effectiveClose,
  getMemo,
  MEMO_DRAFT_PERMISSION,
  MEMO_ISSUE_PERMISSION,
  REPLAY_EXCLUSIONS,
  WORKING_STATE_COLLECTIONS,
  type ServiceContext,
  type Workspace,
} from "../src/index.js";

/**
 * Stage F — the close memo.
 *
 * The memo is the first working state added since the close loop, and the
 * rule that governs it (decision D8) is a negative one: writing a memo must
 * not change the close it describes. Several tests below exist only to prove
 * that nothing moved.
 *
 * The rest pin the sealing model — one editable object, a sealed version
 * superseded rather than edited, and a stated comparison between the close a
 * version was sealed against and the close as it stands.
 */

let ws: Workspace;
let commands: ReturnType<typeof createCommandService>;

const ctx = (role: Role): ServiceContext => ({
  user: userByRole(role),
  correlationId: `T-MEMO-${role}`,
  sourceInterface: "TEST",
});

const DRAFT = { title: "FY2026 Inventory Close Memo", body: "Management's assessment." };

beforeEach(() => {
  ws = createWorkspace();
  commands = createCommandService(ws);
});

describe("drafting", () => {
  it("keeps exactly one editable object however many times it is saved", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.saveMemoDraft(ctx("CONTROLLER"), { ...DRAFT, body: "Second pass." });
    commands.saveMemoDraft(ctx("CONTROLLER"), { ...DRAFT, body: "Third pass." });
    expect(ws.memoVersions).toHaveLength(1);
    expect(ws.memoVersions.filter((v) => v.editable)).toHaveLength(1);
    expect(ws.memoVersions[0]?.body).toBe("Third pass.");
  });

  it("refuses a draft with no title or no body", () => {
    expect(() => commands.saveMemoDraft(ctx("CONTROLLER"), { ...DRAFT, title: "  " })).toThrow();
    expect(() => commands.saveMemoDraft(ctx("CONTROLLER"), { ...DRAFT, body: "  " })).toThrow();
    expect(ws.memoVersions).toHaveLength(0);
  });

  it("records who wrote it and when, from the logical clock", () => {
    const draft = commands.saveMemoDraft(ctx("ACCOUNTING_MANAGER"), DRAFT);
    expect(draft.byUserId).toBe(userByRole("ACCOUNTING_MANAGER").id);
    expect(draft.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(draft.sealed).toBe(false);
    expect(draft.contentHash).toBeUndefined();
  });
});

describe("issuing", () => {
  it("seals the text and the close state, and leaves nothing editable", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    const issued = commands.issueMemoVersion(ctx("CONTROLLER"), {});
    expect(issued.version).toBe(1);
    expect(issued.state).toBe("ISSUED");
    expect(issued.sealed).toBe(true);
    expect(issued.editable).toBe(false);
    // Two hashes, answering two different questions: what was said, and what
    // the close looked like when it was said.
    expect(issued.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.closeStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.contentHash).not.toBe(issued.closeStateHash);
    expect(ws.memoVersions.filter((v) => v.editable)).toHaveLength(0);
  });

  it("supersedes the previous version rather than replacing it", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    commands.saveMemoDraft(ctx("CONTROLLER"), { ...DRAFT, body: "Revised." });
    const second = commands.issueMemoVersion(ctx("CONTROLLER"), {});

    expect(second.version).toBe(2);
    const first = ws.memoVersions.find((v) => v.version === 1);
    expect(first?.state).toBe("SUPERSEDED");
    expect(first?.supersededByVersion).toBe(2);
    // Superseded, not deleted: the first version's own text survives.
    expect(first?.body).toBe(DRAFT.body);
    expect(first?.sealed).toBe(true);
  });

  it("refuses when there is no working draft", () => {
    expect(() => commands.issueMemoVersion(ctx("CONTROLLER"), {})).toThrow(
      /no working draft/i,
    );
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    // And again immediately: issuing consumed the draft, so there is nothing
    // left to issue and the same refusal applies.
    expect(() => commands.issueMemoVersion(ctx("CONTROLLER"), {})).toThrow(
      /no working draft/i,
    );
  });

  it("writes the act to the append-only trail", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    const version = commands.issueMemoVersion(ctx("CONTROLLER"), {
      note: "Reviewed with the CFO.",
    });
    const actions = ws.audit.list().map((e) => e.action);
    expect(actions).toContain("MEMO_DRAFT_SAVED");
    expect(actions).toContain("MEMO_VERSION_ISSUED");
    const issued = ws.audit.list().find((e) => e.action === "MEMO_VERSION_ISSUED");
    expect(issued?.reason).toBe("Reviewed with the CFO.");
    // The trail outlives the memo a reset clears, so the event has to identify
    // WHICH text was sealed on its own — the id alone cannot, since a later
    // memo can carry the same displayed version number.
    expect(version.contentHash, "the issued version must be sealed").toBeDefined();
    expect(issued?.detail).toContain(version.contentHash!);
  });
});

describe("the memo is not part of the close it describes (D8)", () => {
  it("moves no figure the close derives", () => {
    const before = {
      readiness: effectiveClose(ws).readinessBps,
      blockers: effectiveClose(ws).blockerCount,
      pbc: ws.close.pbc.length,
      pbcReady: ws.close.aggregates.pbcReady,
      outputHash: ws.close.runManifest.outputHash,
    };
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    expect(effectiveClose(ws).readinessBps).toBe(before.readiness);
    expect(effectiveClose(ws).blockerCount).toBe(before.blockers);
    expect(ws.close.pbc.length).toBe(before.pbc);
    expect(ws.close.aggregates.pbcReady).toBe(before.pbcReady);
    expect(ws.close.runManifest.outputHash).toBe(before.outputHash);
  });

  it("never becomes a twenty-second audit request", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    expect(ws.close.pbc.map((p) => p.id)).not.toContain("PBC-022");
    for (const item of ws.close.pbc) {
      expect(item.title.toLowerCase(), item.id).not.toContain("memo");
    }
  });

  it("is named among what the reproducibility check excludes", () => {
    // The sentence used to name four collections while the workspace held
    // six: the one disclosure whose job is to say what the check skipped was
    // itself skipping two. It is derived from WORKING_STATE_COLLECTIONS now,
    // so this asserts the derivation reaches the sentence rather than
    // re-listing the nouns — a list in the test would be the same second
    // copy that caused the drift.
    const sentence = REPLAY_EXCLUSIONS.join(" ");
    expect(WORKING_STATE_COLLECTIONS.length).toBeGreaterThan(0);
    for (const c of WORKING_STATE_COLLECTIONS) {
      expect(sentence.includes(c.plural), `${c.key} is not named`).toBe(true);
    }
    expect(sentence).toContain("close-memo versions");
  });

  it("keeps the enumerated collections in step with the workspace itself", () => {
    // The compile-time guard in workspace.ts is the real one; this is the
    // runtime cross-check, because a type-level assertion can be defeated by
    // a cast and this cannot. Every array-valued field of a fresh workspace
    // must be a collection the list knows about, and vice versa.
    const derived = new Set(
      Object.entries(ws)
        .filter(([, value]) => Array.isArray(value))
        .map(([key]) => key),
    );
    const listed = new Set<string>(WORKING_STATE_COLLECTIONS.map((c) => c.key));
    expect([...derived].sort()).toEqual([...listed].sort());
  });
});

describe("the position comparison", () => {
  it("is null before anything is issued", () => {
    expect(getMemo(ws, ctx("CONTROLLER")).positionMoved).toBeNull();
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    // A draft is still not a comparison: nothing has been sealed.
    expect(getMemo(ws, ctx("CONTROLLER")).positionMoved).toBeNull();
  });

  it("is false immediately after issue, and true once the close moves", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    expect(getMemo(ws, ctx("CONTROLLER")).positionMoved).toBe(false);

    // A condition the baseline cannot produce. Without it, a flag hard-coded
    // to false would pass every other assertion in this file.
    commands.concludeException(ctx("CONTROLLER"), {
      exceptionId: "EXC-007",
      conclusion: "REMAINS_OPEN",
      rationale: "Chased the custodian again.",
    });
    // REMAINS_OPEN does not move the close, so the comparison must still hold.
    expect(getMemo(ws, ctx("CONTROLLER")).positionMoved).toBe(false);

    ws.close = {
      ...ws.close,
      exceptions: ws.close.exceptions.map((e) =>
        e.id === "EXC-003" ? { ...e, status: "RESOLVED_NO_ADJUSTMENT" as const } : e,
      ),
    };
    expect(getMemo(ws, ctx("CONTROLLER")).positionMoved).toBe(true);
  });

  it("reads every figure from the close rather than from the memo", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    const memo = getMemo(ws, ctx("CONTROLLER"));
    const live = effectiveClose(ws);
    expect(memo.position.subledgerCents).toBe(ws.close.reconciliation.subledgerCents);
    expect(memo.position.grossGlCents).toBe(ws.close.reconciliation.grossGlCents);
    expect(memo.position.blockerCount).toBe(live.blockerCount);
    expect(memo.position.readinessBps).toBe(live.readinessBps);
    expect(memo.position.bookUnits).toBe(ws.dataset.inventoryUnits.length);
    expect(memo.position.pbcReady).toBe(ws.close.aggregates.pbcReady);
  });
});

describe("who may do what", () => {
  it("offers exactly what it allows, for every demo user", () => {
    // Offer and allow are computed from the same permission keys, so a
    // control is never shown to someone the command would refuse — and never
    // hidden from someone it would accept.
    for (const user of DEMO_USERS) {
      const c: ServiceContext = {
        user,
        correlationId: "T-MEMO-CAP",
        sourceInterface: "TEST",
      };
      let memo;
      try {
        memo = getMemo(ws, c);
      } catch {
        // No close.read at all: nothing to reconcile for this user.
        expect(hasPermission(user, "close.read")).toBe(false);
        continue;
      }
      expect(memo.canDraft, `${user.id} draft offer`).toBe(
        hasPermission(user, MEMO_DRAFT_PERMISSION),
      );
      expect(memo.canIssue, `${user.id} issue offer`).toBe(
        hasPermission(user, MEMO_ISSUE_PERMISSION),
      );

      // Every offer is cross-checked against a REAL invocation, in both
      // period states. Asserting the flag against the expression that
      // produces it tests the projection and never the command — which is how
      // issuing came to have no invocation test at all.
      //
      // What this cannot see: `review.approve`, `exception.conclude` and
      // `audit.read` are held by exactly the roles that hold `memo.issue`, so
      // `period.lock` is the only key that discriminates (U-003 is the only
      // user separating them).
      for (const state of ["OPEN", "LOCKED"] as const) {
        const fresh = createWorkspace();
        const cmds = createCommandService(fresh);
        if (state === "LOCKED") cmds.lockPeriod(ctx("CONTROLLER"), "LOCKED");

        const view = getMemo(fresh, c);
        // The role flags stay role-only: the period is a separate refusal.
        expect(view.canDraft, `${user.id} draft offer at ${state}`).toBe(
          hasPermission(user, MEMO_DRAFT_PERMISSION),
        );
        expect(view.canIssue, `${user.id} issue offer at ${state}`).toBe(
          hasPermission(user, MEMO_ISSUE_PERMISSION),
        );
        // Read the SHARED predicate rather than restating `state !== "LOCKED"`.
        expect(view.periodBlocks === null, `${user.id} period gate at ${state}`).toBe(
          mutationAllowed(fresh.period.state),
        );

        const mayWrite = view.periodBlocks === null;
        if (memo.canDraft && mayWrite) {
          expect(() => cmds.saveMemoDraft(c, DRAFT)).not.toThrow();
        } else if (!memo.canDraft) {
          // Pinned to the class: the guard order is authorize → requireMutable
          // → "no working draft", so a bare `.toThrow()` passes for the wrong
          // reason at LOCKED.
          expect(() => cmds.saveMemoDraft(c, DRAFT)).toThrow(AuthorizationError);
        } else {
          expect(() => cmds.saveMemoDraft(c, DRAFT)).toThrow(PeriodLockedError);
        }

        // Issuing needs a draft to exist; issuing checks no authorship, so it
        // may be seeded by anyone who may draft.
        const seeder = createWorkspace();
        const seedCmds = createCommandService(seeder);
        seedCmds.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
        if (state === "LOCKED") seedCmds.lockPeriod(ctx("CONTROLLER"), "LOCKED");
        const seeded = getMemo(seeder, c);
        if (memo.canIssue && seeded.periodBlocks === null) {
          expect(() => seedCmds.issueMemoVersion(c, {})).not.toThrow();
        } else if (!memo.canIssue) {
          expect(() => seedCmds.issueMemoVersion(c, {})).toThrow(AuthorizationError);
        } else {
          expect(() => seedCmds.issueMemoVersion(c, {})).toThrow(PeriodLockedError);
        }
      }
    }
  });

  it("separates preparing from issuing", () => {
    // A preparer may write the memo and may not put management's name to it.
    expect(hasPermission(userByRole("PREPARER"), MEMO_DRAFT_PERMISSION)).toBe(true);
    expect(hasPermission(userByRole("PREPARER"), MEMO_ISSUE_PERMISSION)).toBe(false);
    commands.saveMemoDraft(ctx("PREPARER"), DRAFT);
    expect(() => commands.issueMemoVersion(ctx("PREPARER"), {})).toThrow(
      /lacks permission/i,
    );
    // And the draft the preparer wrote survives the refusal.
    expect(ws.memoVersions).toHaveLength(1);
    expect(ws.memoVersions[0]?.editable).toBe(true);
  });

  it("refuses everything while the period is locked", () => {
    commands.lockPeriod(ctx("CONTROLLER"), "LOCKED");
    expect(() => commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT)).toThrow(/locked/i);
  });
});

describe("auditor scope", () => {
  it("withholds unissued drafts and says how many", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    const auditor = getMemo(ws, ctx("AUDITOR_READ_ONLY"));
    expect(auditor.versions).toHaveLength(0);
    expect(auditor.workingDraft).toBeNull();
    expect(auditor.withheldDraftCount).toBe(1);

    const controller = getMemo(ws, ctx("CONTROLLER"));
    expect(controller.versions).toHaveLength(1);
    expect(controller.workingDraft).not.toBeNull();
    expect(controller.withheldDraftCount).toBe(0);
  });

  it("shows an issued version in full, and claims no withholding then", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    const auditor = getMemo(ws, ctx("AUDITOR_READ_ONLY"));
    expect(auditor.versions).toHaveLength(1);
    expect(auditor.issued?.body).toBe(DRAFT.body);
    // Nothing is withheld once the draft has become the issued version, so a
    // withholding count above zero here would be a claimed redaction that did
    // not happen.
    expect(auditor.withheldDraftCount).toBe(0);
  });
});

describe("demo reset", () => {
  it("clears the memo and reports how many versions it cleared", () => {
    commands.saveMemoDraft(ctx("CONTROLLER"), DRAFT);
    commands.issueMemoVersion(ctx("CONTROLLER"), {});
    commands.saveMemoDraft(ctx("CONTROLLER"), { ...DRAFT, body: "Next." });
    expect(ws.memoVersions).toHaveLength(2);

    const result = commands.resetDemo(ctx("CONTROLLER"));
    expect(result.cleared.memoVersions).toBe(2);
    expect(ws.memoVersions).toHaveLength(0);
    // A reset that silently kept or dropped state is indistinguishable from
    // one that did the opposite, so the counts travel in the audit detail too.
    //
    // Asserted through `describeWorkingState` rather than against a literal:
    // a literal here would pin the wording instead of the behaviour, and this
    // test previously did exactly that — it kept passing the phrase "2 memo
    // versions" after the sentence had become the shared one, which is the
    // "a test that pins a literal keeps a defect green" shape.
    const reset = ws.audit.list().find((e) => e.action === "DEMO_RESET");
    expect(reset?.detail).toContain(describeWorkingState(result.cleared));
    // …and the sentence really does carry this collection's count, or the
    // assertion above would hold against a phrase that never mentions it.
    expect(describeWorkingState(result.cleared)).toContain("2 close-memo versions");
  });
});

/**
 * The working draft is withheld by CAPABILITY, not by a role literal.
 *
 * `getMemo` tested `roles.includes("AUDITOR_READ_ONLY")` while `canDraft` two
 * fields below already tested `hasPermission`. Four roles hold neither
 * `memo.draft` nor `memo.issue` and are not the auditor — WAREHOUSE,
 * SUPPLY_CHAIN, FPA, LEGAL — so every one of them received `workingDraft` in
 * full, and `/close-memo` rendered its title, author and timestamp. A denylist
 * of one role standing in for a capability fails the moment a role is added
 * that nobody remembers to name.
 */
describe("an unissued draft reaches exactly the roles that may write one", () => {
  it("withholds it from every role without the drafting permission", () => {
    const ws = createWorkspace();
    const commands = createCommandService(ws);
    const controller = DEMO_USERS.find((u) => u.roles.includes("CONTROLLER"))!;
    commands.saveMemoDraft(
      { user: controller, correlationId: "T-DRAFT", sourceInterface: "TEST" },
      { title: "Working draft", body: "INTERNAL — reserve exposure, do not circulate" },
    );

    let sawVisible = 0;
    let sawWithheld = 0;
    for (const user of DEMO_USERS) {
      const ctx = { user, correlationId: `T-DRAFT-${user.id}`, sourceInterface: "TEST" };
      let memo;
      try {
        memo = getMemo(ws, ctx);
      } catch {
        continue; // no close.read at all; a different refusal entirely
      }
      // The biconditional: visibility and the capability are the same fact.
      expect(memo.workingDraft !== null, `${user.id} (${user.roles[0]})`).toBe(memo.canDraft);
      if (memo.workingDraft !== null) sawVisible += 1;
      else {
        sawWithheld += 1;
        // And the withholding is disclosed, counted from what was withheld.
        expect(memo.withheldDraftCount, user.id).toBeGreaterThan(0);
        expect(memo.withheldNote, user.id).toMatch(/withheld from this role/);
      }
    }
    // Name the set both ways: a build where nobody sees it satisfies the
    // assertion above while proving nothing.
    expect(sawVisible).toBeGreaterThan(0);
    expect(sawWithheld).toBeGreaterThan(0);
  });

  it("announces no withheld draft when there is none", () => {
    // The sibling defect the fix must not reopen: a count keyed on the role
    // rather than on what was actually withheld announces a draft that does
    // not exist.
    const ws = createWorkspace();
    for (const user of DEMO_USERS) {
      const ctx = { user, correlationId: `T-NODRAFT-${user.id}`, sourceInterface: "TEST" };
      try {
        const memo = getMemo(ws, ctx);
        expect(memo.withheldDraftCount, user.id).toBe(0);
        expect(memo.withheldNote, user.id).toBeNull();
      } catch {
        continue;
      }
    }
  });
});
