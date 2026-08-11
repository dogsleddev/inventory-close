import type { Metadata } from "next";
import { buildExceptionsData, buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { ExceptionsScreen } from "../../components/ExceptionsScreen";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Exceptions",
  description:
    "Every exception the close rules raised, ranked by what it prevents, with the evidence each one is waiting on.",
};

/**
 * The queue, optionally narrowed to the blocking items — the destination of
 * the Overview's blocker and exposure figures. The filter is stated on the
 * page, so a narrowed count can never be mistaken for the close's own.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  const { filter } = await searchParams;
  return (
    <ExceptionsScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionsData(user, correlationId, undefined, filter)}
      setRoleAction={setRole}
    />
  );
}
