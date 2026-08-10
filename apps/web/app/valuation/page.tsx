import { ValuationScreen } from "../../components/ValuationScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildValuationData } from "../../lib/server/valuation-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/** Valuation — aging, review populations, damage/RMA, reserve UNDETERMINED. */
export default async function ValuationPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ValuationScreen
      shell={buildShellData(user, correlationId)}
      data={buildValuationData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
