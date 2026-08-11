import type { Metadata } from "next";
import { EvidenceScreen } from "../../components/EvidenceScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildEvidenceData } from "../../lib/server/evidence-view";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "The evidence index: every record the close reads, the source that produced it, how it bears on an exception, and the required records that do not exist.",
};

/** Evidence Center — the graph itself, plus the gaps and source health. */
export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string }>;
}) {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  const params = await searchParams;
  return (
    <EvidenceScreen
      shell={buildShellData(user, correlationId)}
      data={buildEvidenceData(user, correlationId, params.record)}
      setRoleAction={setRole}
    />
  );
}
