import { currentUser, newCorrelationId } from "../../../../lib/server/current-user";
import { buildCsv, isExportTable } from "../../../../lib/server/export-csv";

/**
 * CSV export.
 *
 * Node runtime, not edge: the evidence package hashes with `node:crypto`.
 *
 * The handler does no authorization of its own — that is the point. It calls
 * the same QueryService the screens call, so a role that cannot read a table
 * on screen cannot export it either, and an auditor's export is scoped the
 * same way their screens are. A permission denial surfaces as a 403 rather
 * than an empty file, because an empty CSV reads as "there is nothing there".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params;
  if (!isExportTable(table)) {
    return new Response("Unknown export table.\n", { status: 404 });
  }

  const user = await currentUser();
  try {
    const csv = buildCsv(user, table, newCorrelationId());
    return new Response(csv.body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${csv.filename}"`,
        // A close export is a point-in-time artifact; caching one would hand
        // back a stale population after a Reset Demo.
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(
      "This table is outside your role's scope in this demo.\n",
      { status: 403 },
    );
  }
}
