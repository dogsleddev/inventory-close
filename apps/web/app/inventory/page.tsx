import type { Metadata } from "next";
import { InventorySearchScreen } from "../../components/InventorySearchScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildInventorySearchData } from "../../lib/server/financial-life-view";
import {
  buildInventoryListData,
  type InventoryListParams,
} from "../../lib/server/inventory-list-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inventory",
  description:
    "Every unit on the FY2026 year-end listing, filterable — and one step from any unit to where it is, who owns it and what it cost.",
};

/**
 * Inventory — the master population plus the global serial search.
 *
 * Filters arrive as a GET query string, exactly like the existing `?q=`
 * search: the URL is the whole filter state, so a filtered population is
 * shareable, bookmarkable and reproducible, and the 1,500-row list is
 * narrowed on the server rather than in the browser. The route is
 * force-dynamic, so every combination is rendered fresh.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventoryListParams>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <InventorySearchScreen
      shell={buildShellData(user, correlationId)}
      data={buildInventorySearchData(user, params.q ?? "", correlationId)}
      master={buildInventoryListData(user, params, correlationId)}
      setRoleAction={setRole}
    />
  );
}
