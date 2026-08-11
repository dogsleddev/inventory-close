import type { Metadata } from "next";
import { AdjustmentsScreen } from "../../components/AdjustmentsScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildAdjustmentsData } from "../../lib/server/adjustments-view";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adjustments",
  description:
    "The register of reconciling items: which are only identified, which have an entry drafted against them, and what each one would correct. Nothing is posted.",
};

/** Adjustments — the proposed-entry register (stage 07). Nothing is posted. */
export default async function AdjustmentsPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <AdjustmentsScreen
      shell={buildShellData(user, correlationId)}
      data={buildAdjustmentsData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
