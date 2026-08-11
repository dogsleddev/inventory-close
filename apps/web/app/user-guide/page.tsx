import type { Metadata } from "next";
import { UserGuideScreen } from "../../components/UserGuideScreen";
import { buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How to Explore This Demo",
  description:
    "Start here: three guided journeys through the close, what this product does and refuses to do, and the terms it uses in their accounting sense.",
};

/**
 * How to Explore This Demo — the START HERE page. Three guided journeys on
 * the shell; every figure stays on the screen that reads it from the
 * services, so this page quotes none.
 *
 * The route keeps its /user-guide address: it is the one URL that may have
 * been shared or recorded, and a rename would break it for no reader's
 * benefit.
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
