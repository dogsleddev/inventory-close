import { InventorySearchScreen } from "../../components/InventorySearchScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildInventorySearchData } from "../../lib/server/financial-life-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/** Inventory — global serial search; one click to Financial Life (docs/11). */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <InventorySearchScreen
      shell={buildShellData(user, correlationId)}
      data={buildInventorySearchData(user, q ?? "", correlationId)}
      setRoleAction={setRole}
    />
  );
}
