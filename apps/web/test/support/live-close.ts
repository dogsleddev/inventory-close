import { userByRole } from "@icg/data";
import type { CommandService } from "@icg/services";
import { getCommands, getQueries, getWorkspace, makeContext } from "../../lib/server/workspace";

/**
 * Driving the close from a test, in one place.
 *
 * Every surface fixed in this family only diverges from the rules' baseline
 * AFTER a management conclusion is recorded, so a test that asserts on a fresh
 * workspace asserts where the mechanism under test is inert — which is the
 * measured cause of this repo's fix-reopen rate. Setting that state up is
 * eight lines of command calls, and it had been copied into each test file
 * that needed it; the copies are what let one of them drift into satisfying no
 * requirements and concluding nothing.
 *
 * This is the `resolveAllBut(keep)` shape from `overview.test.tsx:366-395`,
 * lifted so the files added in this pass share one definition of "the user did
 * the work". `overview.test.tsx` keeps its own copy: rewriting a passing test's
 * fixture is how a regression test quietly stops asserting.
 */

type Conclusion = Parameters<CommandService["concludeException"]>[1]["conclusion"];

export const controller = () => userByRole("CONTROLLER");
export const manager = () => userByRole("ACCOUNTING_MANAGER");

export function controllerCtx(correlationId = "T-LIVE") {
  return makeContext(controller(), correlationId);
}

/** The rules' own blocker list, in the rules' own order. */
export function baselineBlockerIds(): readonly string[] {
  return getWorkspace().close.blockers.map((b) => b.exceptionId);
}

/**
 * Submit and accept a record against every requirement the exception still has
 * outstanding — read LIVE, so this converges rather than replaying a frozen
 * list. The accepting role is not the submitting role, because the command
 * service refuses self-approval.
 */
export function satisfyRequirements(exceptionId: string): void {
  const commands = getCommands();
  const queries = getQueries();
  const ctx = controllerCtx("T-LIVE-SUBMIT");
  for (const requirement of queries.getExceptionWorkflow(ctx, exceptionId).unmetRequirements) {
    const submitted = commands.submitEvidence(ctx, {
      title: `Support for ${requirement}`,
      kind: "DOCUMENT",
      content: { note: "Obtained." },
      relatedObjectRef: exceptionId,
      satisfiesRequirement: { exceptionId, requirement },
    });
    commands.reviewEvidence(
      makeContext(manager(), "T-LIVE-REVIEW"),
      submitted.id,
      "ACCEPTED",
      "Reviewed.",
    );
  }
}

/** Satisfy what the item needs, then record management's conclusion on it. */
export function concludeException(
  exceptionId: string,
  conclusion: Conclusion = "RESOLVED_NO_ADJUSTMENT",
): void {
  satisfyRequirements(exceptionId);
  getCommands().concludeException(controllerCtx("T-LIVE-CONCLUDE"), {
    exceptionId,
    conclusion,
    rationale: "Support obtained and reviewed; no adjustment required.",
  });
}

/** Conclude every blocker but `keep` of them, oldest first. */
export function resolveAllBut(keep: number): void {
  const ids = baselineBlockerIds();
  for (const id of ids.slice(0, ids.length - keep)) concludeException(id);
}

/**
 * The workspace is a process-global singleton, so a file that concludes and
 * does not restore moves every assertion after it — in this file and, through
 * `globalThis`, in anything sharing the process.
 */
export function resetDemo(): void {
  getCommands().resetDemo(controllerCtx("T-LIVE-RESET"));
}
