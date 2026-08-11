import type { Metadata } from "next";
import { buildExceptionsData, buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { ExceptionsScreen } from "../../components/ExceptionsScreen";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cutoff",
  description:
    "Shipments and receipts that fall either side of the balance-sheet date, and the exceptions raised where the two disagree.",
};

/**
 * Cutoff (stage 09) — the exception queue filtered to the cutoff control
 * domain (design/IMPLEMENTATION_HANDOFF §9.4). The rows, drawers, ordering
 * and row activation are the queue's; only the population differs, and the
 * page says so rather than presenting a subset as the whole close.
 */
export default async function CutoffPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ExceptionsScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionsData(user, correlationId, "cutoff")}
      setRoleAction={setRole}
    />
  );
}
