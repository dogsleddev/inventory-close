import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NAV_SECTIONS } from "../../lib/nav";
import { NotDesignedScreen } from "../../components/NotDesignedScreen";
import { buildShellData } from "../../lib/server/data";
import { currentUser, newCorrelationId } from "../../lib/server/current-user";
import { setRole } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The title says the section is not built rather than pretending it is: the
 * tab is the first place a reader would otherwise be misled. An address that
 * is not a nav section at all falls through to `not-found`, and the title
 * says that instead.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const entry = NAV_SECTIONS.find((s) => s.href === `/${section}`);
  if (entry === undefined) return { title: "Page not found" };
  return {
    title: `${entry.label} (not designed yet)`,
    description:
      "This section is not built yet. The shell, status system and drawers around it are final and will carry the screen when it lands.",
  };
}

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
