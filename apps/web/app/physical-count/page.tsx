import type { Metadata } from "next";
import { PhysicalCountScreen } from "../../components/PhysicalCountScreen";
import { buildPhysicalCountData } from "../../lib/server/count-view";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { buildShellData } from "../../lib/server/data";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Physical Count",
  description:
    "The year-end count and its cycle history, test counts and movement controls — what was counted, by whom, and what the sheets did not reach.",
};

/**
 * Physical Count — year-end count, cycle history, test counts, movements.
 * `?tab=` opens one directly (stage 09).
 */
export default async function PhysicalCountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <PhysicalCountScreen
      shell={buildShellData(user, correlationId)}
      data={buildPhysicalCountData(user, correlationId)}
      initialTab={tab}
      setRoleAction={setRole}
    />
  );
}
