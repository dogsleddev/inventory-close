"use client";

import Link from "next/link";
import { useState } from "react";
import type { ShellData, ValuationData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { ExceptionDrawer } from "./ExceptionDrawer";
import { NoRecordsState, Panel, PanelHead, RestrictedState, StatusCapsule } from "./kit";

/**
 * Valuation — aging, review populations, damage/RMA, and the reserve
 * (stage 07, built on the exception-detail pattern per §9).
 *
 * The reserve conclusion is UNDETERMINED and there is no control on this
 * screen that would set it. Every population here identifies stock for
 * review; none of them is a write-down, and the carrying values shown are
 * gross exposure, never a proposed reserve.
 */
export function ValuationScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: ValuationData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [exceptionId, setExceptionId] = useState<string | null>(null);
  const drawer = exceptionId !== null ? data.drawers[exceptionId] : undefined;

  return (
    <AppShell
      shell={shell}
      section="Valuation"
      setRoleAction={setRoleAction}
      drawerOpen={drawer !== undefined}
      onCloseDrawer={() => setExceptionId(null)}
      drawer={
        drawer !== undefined ? (
          <ExceptionDrawer data={drawer} onClose={() => setExceptionId(null)} />
        ) : undefined
      }
      askSuggestions={[
        "What is the E&O position?",
        "Which stock has not moved in a year?",
        "Has a reserve been concluded?",
      ]}
      askContext="FY2026 Inventory Close · Valuation"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Valuation</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date Dec. 31, 2026
            </div>
          </div>
        </div>

        {data.restricted || data.reserve === null ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="valuation data" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel decision>
              <PanelHead
                title="Reserve conclusion"
                sub="The rules identify a valuation review. They never compute a reserve."
                large
              />
              <div style={{ padding: "0 18px 16px" }}>
                <div
                  className="icg-split"
                  style={{ "--icg-split-cols": "1fr 1fr" } as React.CSSProperties}
                >
                  <div className="icg-subpanel" style={{ padding: "13px 15px" }}>
                    <div className="icg-label icg-label--md">THIS PERIOD'S CONCLUSION</div>
                    <div
                      className="icg-num"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "27px",
                        fontWeight: 600,
                        color: "var(--warn)",
                        marginTop: "4px",
                      }}
                    >
                      {data.reserve.conclusion}
                    </div>
                    <p
                      className="icg-soft"
                      style={{ fontSize: "11.5px", lineHeight: 1.55, margin: "8px 0 0" }}
                    >
                      {data.reserve.note}
                    </p>
                  </div>
                  <div className="icg-subpanel" style={{ padding: "13px 15px" }}>
                    <div className="icg-label icg-label--md">{data.reserve.recordedLabel}</div>
                    <div
                      className="icg-num"
                      style={{ fontSize: "24px", fontWeight: 600, marginTop: "4px" }}
                    >
                      {data.reserve.recorded}
                    </div>
                    <p
                      className="icg-quiet"
                      style={{ fontSize: "11px", lineHeight: 1.55, margin: "8px 0 0" }}
                    >
                      {data.reserve.recordedNote}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                  <div className="icg-label">OPEN VALUATION REVIEWS</div>
                  {data.reserve.reviews.length === 0 ? (
                    <NoRecordsState note="No exception carries an undetermined reserve — checked against the close population." />
                  ) : null}
                  {data.reserve.reviews.map((review) => (
                    <div key={review.id} className="icg-subpanel" style={{ padding: "11px 13px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Link className="icg-row-id icg-mono" href={`/exceptions/${review.id}`}>
                            {review.id}
                          </Link>
                          <span style={{ fontSize: "12.5px", fontWeight: 600 }}>
                            {review.title}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="icg-num" style={{ fontSize: "14px", fontWeight: 600 }}>
                            {review.exposure}
                          </span>
                          <StatusCapsule status={review.status} />
                        </div>
                      </div>
                      <div
                        className="icg-quiet"
                        style={{ fontSize: "11px", marginTop: "4px" }}
                      >
                        {review.detail}
                      </div>
                      {review.drawerId !== null ? (
                        <button
                          type="button"
                          className="icg-linkbtn"
                          style={{ marginTop: "6px" }}
                          onClick={() => setExceptionId(review.drawerId)}
                        >
                          Open {review.id} summary
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            {data.aging !== null ? (
              <Panel>
                <PanelHead
                  title="Inventory aging"
                  sub="Days since each unit's last movement, at the balance-sheet date."
                />
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">Age band</th>
                        <th scope="col" className="icg-cell-right">
                          Units
                        </th>
                        <th scope="col" className="icg-cell-right">
                          Carrying value
                        </th>
                        <th scope="col">Relative weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.aging.rows.map((row) => (
                        <tr key={row.key}>
                          <th scope="row" style={{ fontSize: "12px", fontWeight: 500 }}>
                            {row.label}
                            {row.aged ? (
                              <span
                                className="icg-quiet"
                                style={{ display: "block", fontSize: "10.5px" }}
                              >
                                Slow-moving by policy
                              </span>
                            ) : null}
                          </th>
                          <td className="icg-cell-money">{row.units}</td>
                          <td className="icg-cell-money">{row.carrying}</td>
                          <td>
                            <div className="icg-bar-track" aria-hidden>
                              <div
                                className={`icg-bar${row.aged ? " icg-bar--aged" : ""}`}
                                style={{ width: `${row.fillPct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {data.aging.unknown !== null ? (
                        <tr>
                          <th scope="row" style={{ fontSize: "12px", color: "var(--ember)" }}>
                            Unknown age
                            <span
                              className="icg-quiet"
                              style={{ display: "block", fontSize: "10.5px" }}
                            >
                              No last-movement date — missing aging evidence, not fresh stock
                            </span>
                          </th>
                          <td className="icg-cell-money">{data.aging.unknown.units}</td>
                          <td className="icg-cell-money">{data.aging.unknown.carrying}</td>
                          <td />
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <p
                  className="icg-quiet"
                  style={{ fontSize: "10.5px", lineHeight: 1.55, padding: "11px 18px 15px", margin: 0 }}
                >
                  {data.aging.note}
                </p>
              </Panel>
            ) : null}

            <Panel>
              <PanelHead
                title="Valuation review populations"
                sub="Each population identifies stock for review. None of them is a write-down."
              />
              <div className="icg-table-wrap">
                <table className="icg-table">
                  <thead>
                    <tr>
                      <th scope="col">Population</th>
                      <th scope="col">Basis</th>
                      <th scope="col" className="icg-cell-right">
                        Units
                      </th>
                      <th scope="col" className="icg-cell-right">
                        Carrying value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.populations.map((p) => (
                      <tr key={p.key}>
                        <th scope="row" style={{ fontSize: "12px", fontWeight: 500 }}>
                          {p.label}
                        </th>
                        <td className="icg-soft" style={{ fontSize: "11px" }}>
                          {p.basis}
                        </td>
                        <td className="icg-cell-money">{p.units}</td>
                        <td className="icg-cell-money">{p.carrying}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Damaged and returned units"
                sub="Units in the damaged/hold area, carried at full value."
              />
              {data.damaged.empty !== null ? (
                <div style={{ padding: "0 18px 16px" }}>
                  <NoRecordsState note={data.damaged.empty} />
                </div>
              ) : (
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">Serial</th>
                        <th scope="col">SKU</th>
                        <th scope="col">RMA</th>
                        <th scope="col">Reason</th>
                        <th scope="col" className="icg-cell-right">
                          Carrying value
                        </th>
                        <th scope="col">Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.damaged.rows.map((row) => (
                        <tr key={row.serial}>
                          {/* The cell must not be positioned: `.icg-row-btn::after`
                              stretches over `.icg-table tr`, and `icg-row-link`
                              lifts the ID link above it (§4 row activation). */}
                          <td>
                            {row.drawerId !== null ? (
                              <button
                                type="button"
                                className="icg-row-btn"
                                aria-label={`Open ${row.exceptionId} summary`}
                                onClick={() => setExceptionId(row.drawerId)}
                              />
                            ) : null}
                            <Link
                              className="icg-row-link icg-row-id icg-mono"
                              href={`/inventory/${row.serial}`}
                            >
                              {row.serial}
                            </Link>
                          </td>
                          <td className="icg-mono" style={{ fontSize: "11px" }}>
                            {row.sku}
                          </td>
                          <td className="icg-mono" style={{ fontSize: "11px" }}>
                            {row.rma}
                          </td>
                          <td style={{ fontSize: "11.5px" }}>{row.reason}</td>
                          <td className="icg-cell-money">{row.carrying}</td>
                          <td>
                            {row.assessment !== null ? (
                              <span
                                style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}
                              >
                                <StatusCapsule status={row.assessment} />
                                <span
                                  className="icg-mono"
                                  style={{ fontSize: "10px", color: "var(--frost)" }}
                                >
                                  {row.exceptionId}
                                </span>
                              </span>
                            ) : (
                              <span className="icg-soft" style={{ fontSize: "11px" }}>
                                {row.assessmentNote}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p
                    className="icg-quiet"
                    style={{ fontSize: "10.5px", lineHeight: 1.55, padding: "11px 18px 15px", margin: 0 }}
                  >
                    {data.damaged.note}
                  </p>
                </div>
              )}
            </Panel>
          </>
        )}
      </main>
    </AppShell>
  );
}
