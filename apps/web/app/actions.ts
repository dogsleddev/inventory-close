"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { DEMO_USERS } from "@icg/data";
import { ROLE_COOKIE } from "../lib/server/current-user";

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
