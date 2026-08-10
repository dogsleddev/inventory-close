import { buildExceptionsData, buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { ExceptionsScreen } from "../../components/ExceptionsScreen";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Ownership (stage 09) — the exception queue filtered to the ownership and
 * third-party control domains: the same assertion asked of units that sit
 * somewhere else. The grouping is authored, so the panel states which
 * domains it contains.
 */
export default async function OwnershipPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ExceptionsScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionsData(user, correlationId, "ownership")}
      setRoleAction={setRole}
    />
  );
}
