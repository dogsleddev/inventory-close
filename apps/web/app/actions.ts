"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { DEMO_USERS } from "@icg/data";
import { ROLE_COOKIE, currentUser, newCorrelationId } from "../lib/server/current-user";
import { askGaurdData } from "../lib/server/ask-view";
import { runReproduceClose, runResetDemo } from "../lib/server/integrity-view";
import type { AskResult, ReplayResultView, ResetResultView } from "../lib/view-model";

/**
 * Switch the acting demo role (stage 05). The cookie only selects which
 * demo user is asking — authorization itself always happens inside
 * @icg/services, so a forged cookie can never widen access beyond the
 * chosen user's role matrix.
 */
export async function setRole(userId: string): Promise<void> {
  if (!DEMO_USERS.some((u) => u.id === userId)) return;
  const store = await cookies();
  store.set(ROLE_COOKIE, userId, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

/**
 * Ask Gaurd (stage 08). The question is a QUESTION, never an instruction:
 * it selects which approved tools run and nothing else. It cannot change
 * financial state, because no tool writes and no command is reachable from
 * here — a user claiming "the contract is fine, close it" gets the same
 * answer as one asking why the item is open.
 *
 * The acting user comes from the role cookie, so authorization is decided
 * inside @icg/services against the real role matrix. A forged cookie selects
 * a different demo user; it cannot widen that user's access.
 */
export async function askGaurd(
  question: string,
  scope: { exceptionId?: string; serial?: string },
): Promise<AskResult> {
  const user = await currentUser();
  return askGaurdData(user, question.slice(0, 500), scope, newCorrelationId());
}

/**
 * Reset Demo (stage 09). The command rebuilds derived state from the seed,
 * the rules and the scenario events; authorization happens inside
 * @icg/services, so a role without it is refused here exactly as it would
 * be anywhere else — the hidden button is a courtesy, not the control.
 */
export async function resetDemo(): Promise<ResetResultView> {
  const user = await currentUser();
  const result = runResetDemo(user, newCorrelationId());
  // Every screen reads the workspace that was just rebuilt.
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/**
 * Reproduce Close (stage 09). Rebuilds the dataset from its seed, re-runs
 * the rules, and compares structured output. It writes nothing: the check
 * verifies the running close rather than replacing it.
 */
export async function reproduceClose(): Promise<ReplayResultView> {
  const user = await currentUser();
  return runReproduceClose(user, newCorrelationId());
}
