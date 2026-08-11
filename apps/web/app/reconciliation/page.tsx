import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
 * Reconciliation — the Financial bridge, Commercial Chain, and Serial
 * Integrity tabs. `?serial=` drives the serial-integrity search; `?tab=`
 * opens a tab directly so a demo stop is a link (stage 09).
 *
 * The Procurement Match tab moved to `/procurement` in Stage C. Its deep
 * link is redirected rather than dropped: a URL that worked in a recorded
 * demo must not land on a screen that no longer has that tab and silently
 * show a different one.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string; tab?: string }>;
}) {
  const { serial, tab } = await searchParams;
  if (tab === "procurement") redirect("/procurement?tab=match");
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
