import { buildOverviewData, buildShellData } from "../lib/server/data";
import { currentUser, newCorrelationId } from "../lib/server/current-user";
import { OverviewScreen } from "../components/OverviewScreen";
import { setRole } from "./actions";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <OverviewScreen
      shell={buildShellData(user, correlationId)}
      data={buildOverviewData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
