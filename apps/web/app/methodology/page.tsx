import type { Metadata } from "next";
import { MethodologyScreen } from "../../components/MethodologyScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildMethodologyData } from "../../lib/server/methodology-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Methodology & Calculations",
  description:
    "How close readiness, the subledger-to-ledger bridge and the inventory accounting matrix are derived — and which parts of them are judgements rather than derivations.",
};

export default async function MethodologyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <MethodologyScreen
      shell={buildShellData(user, correlationId)}
      data={buildMethodologyData(user, correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
