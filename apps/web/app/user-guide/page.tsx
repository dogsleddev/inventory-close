import { UserGuideScreen } from "../../components/UserGuideScreen";
import { buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * User Guide (stage 10) — the START HERE page. Static guidance on the
 * shell; every figure stays on the screen that reads it from the services,
 * so this page quotes none.
 */
export default async function UserGuidePage() {
  const user = await currentUser();
  return (
    <UserGuideScreen
      shell={buildShellData(user, newCorrelationId())}
      setRoleAction={setRole}
    />
  );
}
