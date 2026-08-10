import { AuditPackageScreen } from "../../components/AuditPackageScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildAuditPackageData } from "../../lib/server/audit-package-view";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Audit Package — the management-prepared PBC workspace (stage 07). `?pbc=`
 * selects the open workpaper; it defaults to the first item requiring
 * attention.
 */
export default async function AuditPackagePage({
  searchParams,
}: {
  searchParams: Promise<{ pbc?: string }>;
}) {
  const { pbc } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <AuditPackageScreen
      shell={buildShellData(user, correlationId)}
      data={buildAuditPackageData(user, pbc ?? "", correlationId)}
      setRoleAction={setRole}
    />
  );
}
