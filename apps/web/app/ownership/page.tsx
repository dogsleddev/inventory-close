import { redirect } from "next/navigation";
import { FOLDED_ROUTES } from "../../lib/nav";

export const dynamic = "force-dynamic";

/**
 * Ownership was never a screen — it rendered `ExceptionsScreen` with the
 * OWNERSHIP and THIRD_PARTY control-domain lens, which is now a filter on
 * `/exceptions` itself.
 *
 * Kept as a redirect rather than deleted: the site is publicly deployed and
 * a link to /ownership may already exist. See `FOLDED_ROUTES`.
 */
export default function OwnershipPage(): never {
  redirect(FOLDED_ROUTES["/ownership"] as string);
}
