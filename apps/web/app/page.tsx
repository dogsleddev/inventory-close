import type { Metadata } from "next";
import { buildOverviewData, buildShellData } from "../lib/server/data";
import { currentUser, newCorrelationId } from "../lib/server/current-user";
import { OverviewScreen } from "../components/OverviewScreen";
import { setRole } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /**
   * Written out in full on purpose. A `title.template` applies to a layout's
   * CHILD segments, and this page is the root segment itself — "Overview"
   * alone is what the tab would say.
   */
  title: "Overview · Inventory Close Gaurd",
  description:
    "Close readiness at a glance: what is signed off, what is blocked, and which exceptions stand between the two.",
};

export default async function OverviewPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <OverviewScreen
      shell={buildShellData(user, correlationId)}
      data={buildOverviewData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
