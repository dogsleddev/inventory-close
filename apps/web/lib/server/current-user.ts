import { cookies } from "next/headers";
import type { DemoUser } from "@icg/data";
import { userById } from "./workspace";

export const ROLE_COOKIE = "icg-role";

/**
 * The acting demo user comes from the role cookie; the Controller is the
 * default. Selecting a role only changes who is asking — every permission
 * decision stays inside @icg/services.
 */
export async function currentUser(): Promise<DemoUser> {
  const store = await cookies();
  return userById(store.get(ROLE_COOKIE)?.value);
}

export function newCorrelationId(): string {
  return `WEB-${crypto.randomUUID()}`;
}
