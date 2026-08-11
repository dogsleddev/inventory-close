import type { Metadata } from "next";
import { CloseMemoScreen } from "../../components/CloseMemoScreen";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { buildCloseMemoData } from "../../lib/server/memo-view";
import { issueMemoVersion, saveMemoDraft, setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Close Memo",
  description:
    "The management memo on the FY2026 inventory close: management's prose, with every figure beside it read from the close it describes.",
};

export default async function CloseMemoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <CloseMemoScreen
      shell={buildShellData(user, correlationId)}
      data={buildCloseMemoData(user, correlationId)}
      initialTab={tab}
      saveDraftAction={saveMemoDraft}
      issueVersionAction={issueMemoVersion}
      setRoleAction={setRole}
    />
  );
}
