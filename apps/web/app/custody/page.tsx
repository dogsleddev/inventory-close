import type { Metadata } from "next";
import { CustodyScreen } from "../../components/CustodyScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildCustodyData } from "../../lib/server/custody-view";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Custody & Disposition",
  description:
    "Who is holding the company's inventory, whose stock is on the company's floor, and what left the book during FY2026.",
};

/**
 * Custody & Disposition (COMPLETION_PLAN Stage E). `?tab=` opens a population
 * directly, as on Procurement and Costing.
 *
 * This is a NEW route rather than a rework of the ownership lens, which is
 * the exception queue filtered to the ownership and third-party control
 * domains — reachable now as `/exceptions?filter=ownership` rather than as
 * its own route. Those are different questions — one is "what is disputed",
 * this is "who is holding it" — and merging them would delete a working lens.
 */
export default async function CustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <CustodyScreen
      shell={buildShellData(user, correlationId)}
      data={buildCustodyData(user, correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
