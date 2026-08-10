import { buildExceptionsData, buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { ExceptionsScreen } from "../../components/ExceptionsScreen";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ExceptionsScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionsData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
