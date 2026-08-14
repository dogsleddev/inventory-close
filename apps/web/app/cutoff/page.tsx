import { redirect } from "next/navigation";
import { FOLDED_ROUTES } from "../../lib/nav";

export const dynamic = "force-dynamic";

/**
 * Cutoff was never a screen — it rendered `ExceptionsScreen` with the CUTOFF
 * control-domain lens, which is now a filter on `/exceptions` itself.
 *
 * This stub exists rather than the directory being deleted because the site
 * is publicly deployed: a link to /cutoff may already be in someone's notes.
 * The destination comes from `FOLDED_ROUTES` so this file and the tests that
 * prove the old URLs still resolve read ONE list.
 *
 * No `metadata` export: a redirect renders nothing, and a title on a page
 * that never paints is a claim about a screen that no longer exists.
 */
export default function CutoffPage(): never {
  redirect(FOLDED_ROUTES["/cutoff"] as string);
}
