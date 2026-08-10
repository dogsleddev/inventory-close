"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { DEMO_USERS } from "@icg/data";
import { ROLE_COOKIE, currentUser, newCorrelationId } from "../lib/server/current-user";
import { askGaurdData } from "../lib/server/ask-view";
import type { AskResult } from "../lib/view-model";

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
