"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdjustmentsData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { ExceptionDrawer } from "./ExceptionDrawer";
import { NoRecordsState, Panel, PanelHead, RestrictedState, StatusCapsule } from "./kit";

/**
 * Adjustments — the proposed-entry register (stage 07).
 *
 * The screen is built on the bridge-row pattern (IMPLEMENTATION_HANDOFF §9)
 * and holds one distinction above all others: proposed is not posted. Every
 * card is dashed and carries a literal NOT POSTED tag; posted state would be
 * solid and would require a JE reference, which nothing here can produce.
 * An identified item with no drafted entry says so rather than being hidden.
 */
export function AdjustmentsScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: AdjustmentsData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [exceptionId, setExceptionId] = useState<string | null>(null);
  const drawer = exceptionId !== null ? data.drawers[exceptionId] : undefined;

  return (
    <AppShell
      shell={shell}
      section="Adjustments"
      setRoleAction={setRoleAction}
      drawerOpen={drawer !== undefined}
      onCloseDrawer={() => setExceptionId(null)}
      drawer={
        drawer !== undefined ? (
          <ExceptionDrawer data={drawer} onClose={() => setExceptionId(null)} />
        ) : undefined
      }
      askSuggestions={[
        "Which adjustments are proposed but not posted?",
        "Why is there no entry for every reconciling item?",
        "What would the GL be if every proposal were posted?",
      ]}
      askContext="FY2026 Inventory Close · Adjustments"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Adjustments</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date Dec. 31, 2026
            </div>
          </div>
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="proposed adjustments" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel decision>
              <div style={{ padding: "14px 18px 15px" }}>
                <div className="icg-kpis icg-kpis--quad">
                  {data.stats.map((stat) => (
                    <div key={stat.label} className="icg-kpi">
                      <div className="icg-label">{stat.label}</div>
                      <div
                        className="icg-num icg-kpi-value"
                        style={stat.tone === "warn" ? { color: "var(--warn)" } : undefined}
                      >
                        {stat.value}
                      </div>
                      <div className="icg-kpi-note">{stat.note}</div>
                    </div>
                  ))}
                </div>
                <p
                  className="icg-soft"
                  style={{ fontSize: "11.5px", lineHeight: 1.55, margin: "12px 0 0" }}
                >
                  {data.postingNote}
                </p>
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Proposal register"
                sub={data.bridgeNote}
                right={<span className="icg-notposted">0 POSTED</span>}
              />
              <div style={{ padding: "0 18px 16px", display: "grid", gap: "12px" }}>
                {data.cards.length === 0 ? (
                  <NoRecordsState note="No reconciling items are identified for this period." />
                ) : null}
                {data.cards.map((card) => (
                  <article
                    key={card.key}
                    className="icg-proposal"
                    aria-labelledby={`prop-${card.key}`}
                  >
                    <header className="icg-proposal-head">
                      <div style={{ display: "grid", gap: "3px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <Link className="icg-row-id icg-mono" href={card.href}>
                            {card.exceptionId}
                          </Link>
                          <h3
                            id={`prop-${card.key}`}
                            style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}
                          >
                            {card.title}
                          </h3>
                        </div>
                        <div className="icg-quiet" style={{ fontSize: "11px" }}>
                          {card.detail}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className="icg-num"
                          style={{
                            fontSize: "16px",
                            fontWeight: 600,
                            color: card.ember ? "var(--ember)" : "var(--ink)",
                          }}
                        >
                          {card.amount}
                        </span>
                        {card.status !== null ? <StatusCapsule status={card.status} /> : null}
                        <span className="icg-notposted">{card.posted}</span>
                      </div>
                    </header>

                    {card.entry !== null ? (
                      <div style={{ padding: "0 14px 13px" }}>
                        <div
                          className="icg-label"
                          style={{ marginBottom: "6px" }}
                        >
                          {card.entry.id} · PROPOSED JOURNAL ENTRY
                        </div>
                        <table className="icg-table icg-table--flush">
                          <thead>
                            <tr>
                              <th scope="col">Account</th>
                              <th scope="col">Memo</th>
                              <th scope="col">Side</th>
                              <th scope="col" className="icg-cell-right">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {card.entry.lines.map((line, i) => (
                              <tr key={`${line.account}-${i}`}>
                                <td className="icg-mono" style={{ fontSize: "11px" }}>
                                  {line.account}
                                </td>
                                <td style={{ fontSize: "11.5px" }}>{line.memo}</td>
                                <td style={{ fontSize: "11px", letterSpacing: "0.04em" }}>
                                  {line.side}
                                </td>
                                <td className="icg-cell-money">{line.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <dl className="icg-proposal-meta">
                          {[
                            {
                              k: "Balance",
                              v: card.entry.balanced
                                ? "Balanced — debits equal credits"
                                : `Out of balance by ${card.entry.balance}`,
                              warn: !card.entry.balanced,
                            },
                            { k: "Prepared by", v: card.entry.preparer, warn: false },
                            { k: "Reviewer", v: card.entry.reviewer, warn: false },
                            { k: "Approval", v: card.entry.approval, warn: true },
                          ].map((row) => (
                            <div key={row.k} className="icg-proposal-meta-row">
                              <dt className="icg-label">{row.k}</dt>
                              <dd
                                style={{
                                  margin: 0,
                                  fontSize: "11.5px",
                                  color: row.warn ? "var(--ember)" : undefined,
                                  fontWeight: row.warn ? 600 : 400,
                                }}
                              >
                                {row.v}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p
                          className="icg-quiet"
                          style={{ fontSize: "10.5px", lineHeight: 1.5, margin: "9px 0 0" }}
                        >
                          {card.entry.approvalRequirement}
                        </p>
                      </div>
                    ) : (
                      <div style={{ padding: "0 14px 13px" }}>
                        <div className="icg-state" role="status">
                          <span className="icg-state-glyph" aria-hidden>
                            ○
                          </span>
                          <div>
                            <div className="icg-state-title">No entry drafted</div>
                            <div className="icg-state-note">{card.undraftedReason}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {card.drawerId !== null ? (
                      <footer className="icg-proposal-foot">
                        <button
                          type="button"
                          className="icg-linkbtn"
                          onClick={() => setExceptionId(card.drawerId)}
                        >
                          Open {card.exceptionId} summary
                        </button>
                      </footer>
                    ) : null}
                  </article>
                ))}
              </div>
            </Panel>
          </>
        )}
      </main>
    </AppShell>
  );
}
