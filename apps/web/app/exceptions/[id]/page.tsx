import { buildExceptionDetailData, buildShellData } from "../../../lib/server/data";
import { currentUser, newCorrelationId } from "../../../lib/server/current-user";
import { ExceptionDetailScreen } from "../../../components/ExceptionDetailScreen";
import { setRole } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ExceptionDetailScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionDetailData(user, id.toUpperCase(), correlationId)}
      setRoleAction={setRole}
    />
  );
}
