import { notFound } from "next/navigation";
import { NAV_SECTIONS } from "../../lib/nav";
import { NotDesignedScreen } from "../../components/NotDesignedScreen";
import { buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Placeholder route for nav sections that arrive in later stages. Renders
 * the shell's own not-designed state — never placeholder figures.
 */
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const entry = NAV_SECTIONS.find((s) => s.href === `/${section}`);
  if (entry === undefined) notFound();
  const user = await currentUser();
  return (
    <NotDesignedScreen
      shell={buildShellData(user, newCorrelationId())}
      section={entry.label}
      setRoleAction={setRole}
    />
  );
}
