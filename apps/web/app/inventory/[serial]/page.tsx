import type { Metadata } from "next";
import { FinancialLifeScreen } from "../../../components/FinancialLifeScreen";
import { currentUser, newCorrelationId } from "../../../lib/server/current-user";
import { buildShellData } from "../../../lib/server/data";
import { buildFinancialLifeData } from "../../../lib/server/financial-life-view";
import { setRole } from "../../actions";

export const dynamic = "force-dynamic";

/** The serial is the title — it is how anyone comparing two units finds one. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ serial: string }>;
}): Promise<Metadata> {
  const { serial } = await params;
  return {
    title: `${decodeURIComponent(serial).toUpperCase()} · Inventory`,
    description:
      "The financial life of one unit: where it sits, who owns it, what it cost and every event recorded against it.",
  };
}

/** Financial Life of the Unit — the flagship serial view (stage 06). */
export default async function FinancialLifePage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <FinancialLifeScreen
      shell={buildShellData(user, correlationId)}
      data={buildFinancialLifeData(
        user,
        decodeURIComponent(serial).toUpperCase(),
        correlationId,
      )}
      setRoleAction={setRole}
    />
  );
}
