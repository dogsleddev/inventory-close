import type { Metadata } from "next";
import {
  buildExceptionsData,
  buildShellData,
  resolveExceptionFilter,
} from "../../lib/server/data";
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
 * The queue, optionally narrowed — the destination of the Overview's blocker
 * and exposure figures. The filter is stated on the page, so a narrowed count
 * can never be mistaken for the close's own.
 *
 * One query parameter drives all four views, because they are one idea: a
 * filter over one queue. `blockers` is a property of the item; `cutoff` and
 * `ownership` are control domains and reach `buildExceptionsData` by its
 * sectionKey argument instead. That split is an implementation detail of the
 * builder, not of the URL, and the reader should never have to know it —
 * which is exactly why /cutoff and /ownership stopped being routes.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await currentUser();
  const correlationId = newCorrelationId();
  const { filter } = await searchParams;
  const { sectionKey, filterKey } = resolveExceptionFilter(filter);
  return (
    <ExceptionsScreen
      shell={buildShellData(user, correlationId)}
      data={buildExceptionsData(user, correlationId, sectionKey, filterKey)}
      setRoleAction={setRole}
    />
  );
}
