import type { Metadata } from "next";
import { buildExceptionDetailData, buildShellData } from "../../../lib/server/data";
import { currentUser, newCorrelationId } from "../../../lib/server/current-user";
import { ExceptionDetailScreen } from "../../../components/ExceptionDetailScreen";
import { setRole } from "../../actions";

export const dynamic = "force-dynamic";

/**
 * The tab title names the exception, because a Controller reviewing a close
 * has several of these open at once and "Exceptions" on all of them is not a
 * label. The id is taken from the address rather than from the close: it is
 * the same normalisation the page itself applies, and a title is not worth a
 * second full close run.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${decodeURIComponent(id).toUpperCase()} · Exceptions`,
    description:
      "One exception in full: what was found, which evidence supports it, what it blocks and what a person must conclude.",
  };
}

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  const correlationId = newCorrelationId();
  return (
    <ExceptionDetailScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionDetailData(user, id.toUpperCase(), correlationId)}
      setRoleAction={setRole}
    />
  );
}
