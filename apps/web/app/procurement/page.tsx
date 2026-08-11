import type { Metadata } from "next";
import { ProcurementScreen } from "../../components/ProcurementScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildProcurementData } from "../../lib/server/procurement-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Procurement",
  description:
    "The buy side of the close: three-way match, received not invoiced, invoiced not received, goods in transit, and purchase price variance.",
};

/**
 * Procurement (COMPLETION_PLAN Stage C). `?tab=` opens a population directly
 * so a demo stop is a link; `/reconciliation?tab=procurement` redirects here,
 * because the three-way match used to live there.
 */
export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ProcurementScreen
      shell={buildShellData(user, correlationId)}
      data={buildProcurementData(user, correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
