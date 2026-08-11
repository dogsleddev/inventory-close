import type { Metadata } from "next";
import { ValuationScreen } from "../../components/ValuationScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildValuationData } from "../../lib/server/valuation-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Valuation",
  description:
    "Aging, damage and return populations that drive the excess-and-obsolete question, and the reserve that stays undetermined until they are answered.",
};

/** Valuation — aging, review populations, damage/RMA, reserve UNDETERMINED. */
export default async function ValuationPage() {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ValuationScreen
      shell={buildShellData(user, correlationId)}
      data={buildValuationData(user, correlationId)}
      setRoleAction={setRole}
    />
  );
}
