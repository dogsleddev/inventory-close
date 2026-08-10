import { AuditPackageScreen } from "../../components/AuditPackageScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildAuditPackageData } from "../../lib/server/audit-package-view";
import { buildPackageManifest } from "../../lib/server/integrity-view";
import { buildShellData } from "../../lib/server/data";
import { reproduceClose, setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Audit Package — the management-prepared PBC workspace (stage 07). `?pbc=`
 * selects the open workpaper; it defaults to the first item requiring
 * attention. `?tab=` opens one of that workpaper's tabs directly, so a demo
 * stop is a link rather than a sequence of clicks (stage 09).
 */
export default async function AuditPackagePage({
  searchParams,
}: {
  searchParams: Promise<{ pbc?: string; tab?: string }>;
}) {
  const { pbc, tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <AuditPackageScreen
      shell={buildShellData(user, correlationId)}
      data={buildAuditPackageData(user, pbc ?? "", correlationId)}
      manifest={buildPackageManifest(user, correlationId)}
      reproduceAction={reproduceClose}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
