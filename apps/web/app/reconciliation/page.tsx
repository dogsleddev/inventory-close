import type { Metadata } from "next";
import { ReconciliationScreen } from "../../components/ReconciliationScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildReconciliationData } from "../../lib/server/recon-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reconciliation",
  description:
    "Where the subledger and the general ledger part company, and what explains each step of the difference.",
};

/**
 * Reconciliation — the Financial bridge, Procurement Match, Commercial
 * Chain, and Serial Integrity tabs. `?serial=` drives the serial-integrity
 * search; `?tab=` opens a tab directly so a demo stop is a link (stage 09).
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string; tab?: string }>;
}) {
  const { serial, tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ReconciliationScreen
      shell={buildShellData(user, correlationId)}
      data={buildReconciliationData(user, serial ?? "", correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
