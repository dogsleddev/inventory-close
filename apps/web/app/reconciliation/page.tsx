import { ReconciliationScreen } from "../../components/ReconciliationScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildReconciliationData } from "../../lib/server/recon-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Reconciliation — stage 06 ships the Procurement Match, Commercial Chain,
 * and Serial Integrity tabs; the Financial bridge tab arrives in stage 07.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const { serial } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ReconciliationScreen
      shell={buildShellData(user, correlationId)}
      data={buildReconciliationData(user, serial ?? "", correlationId)}
      setRoleAction={setRole}
    />
  );
}
