import { PhysicalCountScreen } from "../../components/PhysicalCountScreen";
import { buildPhysicalCountData } from "../../lib/server/count-view";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Physical Count — year-end count, cycle history, test counts, movements.
 * `?tab=` opens one directly (stage 09).
 */
export default async function PhysicalCountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <PhysicalCountScreen
      shell={buildShellData(user, correlationId)}
      data={buildPhysicalCountData(user, correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
