import type { Metadata } from "next";
import { CostingScreen } from "../../components/CostingScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildCostingData } from "../../lib/server/costing-view";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Costing",
  description:
    "Which costs belong in inventory: the standard cost stack, how its components behave, the FY2026 pools kept out of inventory, and whether the cost of a sold unit has left the book.",
};

/**
 * Costing (COMPLETION_PLAN Stage D). `?tab=` opens a population directly so a
 * demo stop is a link, exactly as it is on Procurement and Reconciliation.
 */
export default async function CostingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <CostingScreen
      shell={buildShellData(user, correlationId)}
      data={buildCostingData(user, correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
