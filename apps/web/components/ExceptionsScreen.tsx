"use client";

import Link from "next/link";
import { useState } from "react";
import type { ExceptionsData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { ExceptionDrawer } from "./ExceptionDrawer";
import {
  Panel,
  PanelHead,
  RestrictedState,
  RiskIndicator,
  SourceStateChip,
  StatusCapsule,
} from "./kit";

/**
 * Exceptions queue (stage 05): all designed exceptions in the deterministic
 * default order — open blockers first, then open items, then resolved;
 * exposure descending within each tier; stable id tiebreak. The row opens
 * the summary drawer; the ID cell navigates to the full object.
 */
export function ExceptionsScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: ExceptionsData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const drawerData = openId !== null ? data.drawers[openId] : undefined;

  return (
    <AppShell
      shell={shell}
      section="Exceptions"
      setRoleAction={setRoleAction}
      drawerOpen={drawerData !== undefined}
      onCloseDrawer={() => setOpenId(null)}
      drawer={
        drawerData !== undefined ? (
          <ExceptionDrawer data={drawerData} onClose={() => setOpenId(null)} />
        ) : undefined
      }
      askSuggestions={["What prevents sign-off?", "Which exceptions are resolved?"]}
      askContext="FY2026 Inventory Close · Exceptions"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Exceptions</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date Dec. 31, 2026
            </div>
          </div>
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="the exception queue" />
            </div>
          </Panel>
        ) : (
          <Panel>
            <PanelHead
              large
              title="Exception queue"
              sub="Open blockers first, then open items, then resolved — exposure descending."
              right={
                <div style={{ textAlign: "right" }}>
                  <div className="icg-num" style={{ fontSize: "12px", fontWeight: 600 }}>
                    {data.openBlockerCount} blockers · {data.openBlockerExposure}
                  </div>
                  <div className="icg-quiet icg-num" style={{ fontSize: "10.5px" }}>
                    {data.totalCount} designed exceptions
                  </div>
                </div>
              }
            />
            <div className="icg-table-wrap">
              <table className="icg-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Exception</th>
                    <th scope="col">Rule</th>
                    <th scope="col" className="icg-cell-right">
                      Exposure
                    </th>
                    <th scope="col">Risk</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} data-selected={openId === row.id}>
                      <td>
                        <button
                          type="button"
                          className="icg-row-btn"
                          aria-label={`Open ${row.id} summary`}
                          onClick={() => setOpenId(row.id)}
                        />
                        <Link href={`/exceptions/${row.id}`} className="icg-row-link icg-row-id">
                          {row.id}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, lineHeight: 1.35 }}>{row.title}</div>
                        {row.coverageWarnings.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "5px",
                              flexWrap: "wrap",
                              marginTop: "3px",
                            }}
                          >
                            {row.coverageWarnings.map((w) => (
                              <SourceStateChip key={w} text={w} />
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className="icg-mono icg-soft" style={{ fontSize: "10.5px" }}>
                          {row.ruleId}
                        </span>
                      </td>
                      <td className="icg-cell-money" style={{ fontSize: "13px" }}>
                        {row.exposure}
                      </td>
                      <td>
                        <RiskIndicator risk={row.risk} />
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            alignItems: "flex-start",
                          }}
                        >
                          <StatusCapsule status={row.status} />
                          {row.blocker ? (
                            <span
                              className="icg-mono icg-soft"
                              style={{
                                fontSize: "9px",
                                letterSpacing: "0.06em",
                                padding: "1px 6px",
                                borderRadius: "3px",
                                border: "1px solid var(--hair-2)",
                              }}
                            >
                              BLOCKER
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="icg-panel-foot">
              <span className="icg-soft" style={{ fontSize: "11px" }}>
                Resolved exceptions keep their full history — resolution never deletes the
                record.
              </span>
            </div>
          </Panel>
        )}
      </main>
    </AppShell>
  );
}
