import { PhysicalCountScreen } from "../../components/PhysicalCountScreen";
import { buildPhysicalCountData } from "../../lib/server/count-view";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/** Physical Count — year-end count, cycle history, test counts, movements. */
export default async function PhysicalCountPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <PhysicalCountScreen
      shell={buildShellData(user, correlationId)}
      data={buildPhysicalCountData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
