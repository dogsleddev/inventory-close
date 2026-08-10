import { FinancialLifeScreen } from "../../../components/FinancialLifeScreen";
import { currentUser, newCorrelationId } from "../../../lib/server/current-user";
import { buildShellData } from "../../../lib/server/data";
import { buildFinancialLifeData } from "../../../lib/server/financial-life-view";
import { setRole } from "../../actions";

export const dynamic = "force-dynamic";

/** Financial Life of the Unit — the flagship serial view (stage 06). */
export default async function FinancialLifePage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <FinancialLifeScreen
      shell={buildShellData(user, correlationId)}
      data={buildFinancialLifeData(
        user,
        decodeURIComponent(serial).toUpperCase(),
        correlationId,
      )}
      setRoleAction={setRole}
    />
  );
}
