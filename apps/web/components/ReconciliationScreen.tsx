"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { ProcurementCard, ReconciliationData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { EvidenceDrawerPanel } from "./EvidenceDrawerPanel";
import { ExceptionDrawer } from "./ExceptionDrawer";
import {
  AuditDetails,
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  StatusCapsule,
  TabBar,
} from "./kit";

/**
 * Reconciliation: the Financial bridge (stage 07) plus Procurement Match,
 * Commercial Chain, and Serial Integrity (stage 06). The native NetSuite
 * match state is a muted mono tag; the close-control state is the colored
 * capsule — two different questions, never conflated. On the bridge, the
 * proposed/posted distinction gets the same treatment: every proposal row
 * carries a literal NOT POSTED tag, never a colour alone.
 */
export function ReconciliationScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: ReconciliationData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>(
    data.serialTab.query !== "" ? "serial" : "financial",
  );
  const [exceptionId, setExceptionId] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const exceptionDrawer = exceptionId !== null ? data.drawers[exceptionId] : undefined;
  const record = recordId !== null ? data.records[recordId] : undefined;
  const drawerOpen = exceptionDrawer !== undefined || record !== undefined;
  const closeDrawers = () => {
    setExceptionId(null);
    setRecordId(null);
  };
  const openException = (id: string | null) => {
    if (id !== null) {
      setRecordId(null);
      setExceptionId(id);
    }
  };
  const openRecord = (id: string | null) => {
    if (id !== null && data.records[id] !== undefined) {
      setExceptionId(null);
      setRecordId(id);
    }
  };

  return (
    <AppShell
      shell={shell}
      section="Reconciliation"
      setRoleAction={setRoleAction}
      {...(data.headerNote !== null ? { headerNote: data.headerNote } : {})}
      drawerOpen={drawerOpen}
      onCloseDrawer={closeDrawers}
      drawer={
        record !== undefined ? (
          <EvidenceDrawerPanel key={record.id} record={record} onClose={closeDrawers} />
        ) : exceptionDrawer !== undefined ? (
          <ExceptionDrawer data={exceptionDrawer} onClose={closeDrawers} />
        ) : undefined
      }
      askSuggestions={[
        "Why can a native match pass while the close stays open?",
        "Which chains are missing required components?",
        "Which procurement matches are incomplete at year-end?",
      ]}
      askContext="FY2026 Inventory Close · Reconciliation"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Reconciliation</h1>
            <div className="icg-page-context">FY2026 · balance-sheet date Dec. 31, 2026</div>
          </div>
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="reconciliation data" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={data.tabs}
                active={tab}
                onSelect={setTab}
                label="Reconciliation tabs"
                panelId="icg-recon-panel"
              />
            </Panel>

            <div
              id="icg-recon-panel"
              role="tabpanel"
              aria-labelledby={`icg-recon-panel-tab-${tab}`}
              style={{ display: "contents" }}
            >
            {tab === "financial" && data.financial !== null ? (
              <>
                {/* Posted and potential are separate panels on purpose: one
                    is recorded in NetSuite today, the other is what would be
                    true if proposals nobody has approved were posted. */}
                <div
                  className="icg-split"
                  style={{ "--icg-split-cols": "1fr 1fr" } as CSSProperties}
                >
                  {[
                    { key: "posted", state: data.financial.posted, adjusted: false },
                    { key: "potential", state: data.financial.potential, adjusted: true },
                  ].map(({ key, state, adjusted }) => (
                    <Panel key={key} className={adjusted ? "" : "icg-panel--decision"}>
                      <div style={{ padding: "14px 18px 15px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <h2 className="icg-label icg-label--md">
                            {adjusted ? "POTENTIAL ADJUSTED STATE" : "CURRENT POSTED STATE"}
                          </h2>
                          <span
                            className={
                              adjusted ? "icg-notposted" : "icg-nstag"
                            }
                          >
                            {state.tag}
                          </span>
                        </div>
                        <dl
                          style={{
                            margin: "11px 0 0",
                            display: "flex",
                            flexDirection: "column",
                            gap: "7px",
                          }}
                        >
                          {state.figures.map((fig) => (
                            <div
                              key={fig.label}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                gap: "12px",
                              }}
                            >
                              <dt
                                style={{
                                  fontSize: "12px",
                                  color: fig.emphasis ? "var(--ink)" : "var(--soft)",
                                  fontWeight: fig.emphasis ? 600 : 400,
                                }}
                              >
                                {fig.label}
                                {fig.note !== null ? (
                                  <span
                                    className="icg-quiet"
                                    style={{ display: "block", fontSize: "10.5px", fontWeight: 400 }}
                                  >
                                    {fig.note}
                                  </span>
                                ) : null}
                              </dt>
                              <dd
                                className="icg-num"
                                style={{
                                  margin: 0,
                                  fontSize: fig.emphasis ? "19px" : "14px",
                                  fontWeight: fig.emphasis ? 600 : 500,
                                  color:
                                    fig.emphasis && fig.ember ? "var(--ember)" : "var(--ink)",
                                }}
                              >
                                {fig.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p
                          className="icg-quiet"
                          style={{ fontSize: "10.5px", lineHeight: 1.55, margin: "11px 0 0" }}
                        >
                          {state.footnote}
                        </p>
                      </div>
                    </Panel>
                  ))}
                </div>

                <Panel>
                  <PanelHead
                    title="Reconciling bridge"
                    sub="Each line traces to an exception with its own management conclusion."
                    right={
                      <span className="icg-nstag">{data.financial.bridge.summary}</span>
                    }
                  />
                  <div className="icg-table-wrap">
                    <table className="icg-table">
                      <thead>
                        <tr>
                          <th scope="col">ID</th>
                          <th scope="col">Reconciling item</th>
                          <th scope="col" className="icg-cell-right">
                            Proposed effect
                          </th>
                          <th scope="col">Status</th>
                          <th scope="col">Posted?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.financial.bridge.rows.map((row) => (
                          <tr
                            key={row.key}
                            data-kind={row.kind}
                            style={
                              row.kind === "opening" || row.kind === "net"
                                ? { background: "var(--panel-2)" }
                                : row.kind === "total"
                                  ? { background: "var(--panel-2)", fontWeight: 600 }
                                  : undefined
                            }
                          >
                            <td>
                              {/* Row opens the drawer; the ID cell navigates
                                  to the full object (§4 row activation). The
                                  overlay must resolve against `.icg-table tr`,
                                  so this cell must NOT be positioned, and the
                                  link needs `icg-row-link` to sit above it. */}
                              {row.exceptionId !== null ? (
                                <button
                                  type="button"
                                  className="icg-row-btn"
                                  aria-label={`Open ${row.id} summary`}
                                  onClick={() => openException(row.exceptionId)}
                                />
                              ) : null}
                              {row.id !== null && row.href !== null ? (
                                <Link className="icg-row-link icg-row-id icg-mono" href={row.href}>
                                  {row.id}
                                </Link>
                              ) : (
                                <span className="icg-quiet" aria-hidden>
                                  —
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: "12px" }}>{row.label}</span>
                              <span
                                className="icg-quiet"
                                style={{ display: "block", fontSize: "10.5px", marginTop: "2px" }}
                              >
                                {row.detail}
                              </span>
                            </td>
                            <td
                              className="icg-cell-money"
                              style={row.ember ? { color: "var(--ember)", fontWeight: 600 } : undefined}
                            >
                              {row.amount}
                            </td>
                            <td>
                              {row.status !== null ? (
                                <StatusCapsule status={row.status} />
                              ) : (
                                <span className="icg-soft" style={{ fontSize: "11.5px" }}>
                                  {row.kind === "opening" ? "Recorded" : "—"}
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  row.posted === "NOT POSTED" ? "icg-notposted" : "icg-nstag"
                                }
                              >
                                {row.posted}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "13px 18px 15px", display: "grid", gap: "10px" }}>
                    {data.financial.unexplained !== null ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "11.5px",
                          color: "var(--ember)",
                          fontWeight: 600,
                        }}
                      >
                        {data.financial.unexplained}
                      </p>
                    ) : null}
                    <div className="icg-subpanel" style={{ padding: "11px 13px" }}>
                      <div className="icg-label">DIRECTION OF EFFECT</div>
                      <p
                        className="icg-soft"
                        style={{ fontSize: "11.5px", lineHeight: 1.55, margin: "5px 0 0" }}
                      >
                        {data.financial.direction}
                      </p>
                    </div>
                    <div className="icg-subpanel" style={{ padding: "11px 13px" }}>
                      <div className="icg-label">RESERVES</div>
                      <p
                        className="icg-soft"
                        style={{ fontSize: "11.5px", lineHeight: 1.55, margin: "5px 0 0" }}
                      >
                        {data.financial.reserves}
                      </p>
                    </div>
                    <AuditDetails rows={data.financial.audit} />
                  </div>
                </Panel>
              </>
            ) : null}

            {tab === "procurement" && data.procurement !== null ? (
              <>
                <Panel>
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "18px",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ maxWidth: "560px" }}>
                      <h2 className="icg-panel-title icg-panel-title--lg">
                        Purchase Order ↔ Item Receipt ↔ Vendor Bill
                      </h2>
                      <p className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.55, margin: "5px 0 0" }}>
                        A native three-way match asks <em>can this bill be paid</em>. The close
                        control asks <em>did we own this at the balance-sheet date</em>. The two
                        answer different questions and are reported separately throughout.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "18px" }}>
                      <div>
                        <div className="icg-label">NETSUITE 3WM PASS</div>
                        <div className="icg-num" style={{ fontSize: "16px", fontWeight: 600 }}>
                          {data.procurement.nativeSummary}
                        </div>
                      </div>
                      <div style={{ borderLeft: "1px solid var(--hair)", paddingLeft: "18px" }}>
                        <div className="icg-label">CLOSE CONTROL</div>
                        <div
                          className="icg-num"
                          style={{ fontSize: "16px", fontWeight: 600, color: "var(--ember)" }}
                        >
                          {data.procurement.closeSummary}
                        </div>
                      </div>
                    </div>
                  </div>
                </Panel>

                {data.procurement.featured.map((card) => (
                  <ProcurementCardView key={card.key} card={card} openException={openException} />
                ))}

                <Panel>
                  <PanelHead
                    title="All procurement matches"
                    sub="Native NetSuite status and close-control status, side by side for every purchase order."
                  />
                  <div className="icg-table-wrap">
                    <table className="icg-table">
                      <thead>
                        <tr>
                          <th scope="col">Purchase order</th>
                          <th scope="col">Item receipt</th>
                          <th scope="col">Vendor bill</th>
                          <th scope="col">Native NetSuite</th>
                          <th scope="col">Close control</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.procurement.rows.map((row) => (
                          <tr key={row.po} data-selected={row.exceptionId !== null && exceptionId === row.exceptionId}>
                            <td>
                              {row.exceptionId !== null ? (
                                <button
                                  type="button"
                                  className="icg-row-btn"
                                  aria-label={`Open ${row.exceptionId} summary`}
                                  onClick={() => openException(row.exceptionId)}
                                />
                              ) : null}
                              <span className="icg-mono" style={{ fontSize: "11px" }}>
                                {row.po}
                              </span>
                            </td>
                            <td>
                              <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                {row.ir}
                              </span>
                            </td>
                            <td>
                              <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                {row.vb}
                              </span>
                            </td>
                            <td>
                              <span className="icg-nstag">{row.native}</span>
                            </td>
                            <td>
                              <span
                                className={`icg-close-capsule${row.close.variant === "aurora" ? " icg-close-capsule--aurora" : ""}`}
                              >
                                <span aria-hidden style={{ fontSize: "9px" }}>
                                  {row.close.glyph}
                                </span>
                                {row.close.label}
                                {row.exceptionId !== null ? (
                                  <span className="icg-mono" style={{ fontSize: "9px" }}>
                                    {row.exceptionId}
                                  </span>
                                ) : null}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="icg-panel-foot">
                    <span className="icg-soft" style={{ fontSize: "11px" }}>
                      A native three-way-match issue is not automatically an accounting
                      exception; it escalates only when a period-end question is affected.
                    </span>
                  </div>
                </Panel>
              </>
            ) : null}

            {tab === "commercial" && data.commercial !== null ? (
              <>
                {data.commercial.featured !== null ? (
                  <Panel>
                    <div style={{ padding: "14px 18px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: "10px",
                          marginBottom: "12px",
                        }}
                      >
                        <div>
                          <h2 className="icg-panel-title icg-panel-title--lg">
                            Commercial chain — {data.commercial.featured.subject}
                          </h2>
                          <div className="icg-quiet icg-num" style={{ fontSize: "11px", marginTop: "2px" }}>
                            {data.commercial.featured.subNote}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                          <span className="icg-quiet" style={{ fontSize: "11px" }}>
                            {data.commercial.featured.summary}
                          </span>
                          {data.commercial.featured.exceptionId !== null ? (
                            <Link
                              href={`/exceptions/${data.commercial.featured.exceptionId}`}
                              className="icg-mono"
                              style={{ fontSize: "11px" }}
                            >
                              Open {data.commercial.featured.exceptionId} ↗
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <div className="icg-chain">
                        {data.commercial.featured.nodes.map((node, i) => {
                          const cls = `icg-chain-node${
                            node.visual === "missing"
                              ? " icg-chain-node--missing"
                              : node.visual === "conflict"
                                ? " icg-chain-node--conflict"
                                : ""
                          }`;
                          const body = (
                            <>
                              <span className="icg-chain-node-type">{node.type}</span>
                              <span className="icg-chain-node-value">{node.value}</span>
                              <span className="icg-chain-node-state">
                                <span aria-hidden style={{ fontSize: "8px" }}>
                                  {node.glyph}
                                </span>
                                {node.state}
                                {node.visual === "missing" ? (
                                  <span className="icg-sr-only"> — missing, required</span>
                                ) : null}
                              </span>
                            </>
                          );
                          return (
                            <div key={node.type + i} className="icg-chain-seg" style={{ flex: node.flex }}>
                              {/* Components with no record behind them —
                                  deliveries carried as a note, absences —
                                  are states, not controls that do nothing. */}
                              {node.evidenceId !== null ? (
                                <button
                                  type="button"
                                  className={cls}
                                  onClick={() => openRecord(node.evidenceId)}
                                >
                                  {body}
                                </button>
                              ) : (
                                <div className={cls}>{body}</div>
                              )}
                              {i < (data.commercial?.featured?.nodes.length ?? 0) - 1 ? (
                                <span className="icg-chain-connector" aria-hidden>
                                  –
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      className="icg-split"
                      style={{ "--icg-split-cols": "1fr 1fr", padding: "0 18px 16px" } as CSSProperties}
                    >
                      <div className="icg-subpanel" style={{ padding: "13px 15px" }}>
                        <div className="icg-label icg-label--md">CHAIN COMPLETENESS</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                          <span
                            className="icg-num"
                            style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 600 }}
                          >
                            {data.commercial.featured.completeness.big}
                          </span>
                          <span className="icg-soft" style={{ fontSize: "12px" }}>
                            components present
                          </span>
                        </div>
                        <div style={{ marginTop: "9px", display: "flex", flexDirection: "column", gap: "5px" }}>
                          {data.commercial.featured.completeness.rows.map((row) => (
                            <div
                              key={row.label}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                                fontSize: "11.5px",
                                color: row.ember ? "var(--ember)" : undefined,
                                fontWeight: row.ember ? 600 : 400,
                              }}
                            >
                              <span>
                                <span
                                  aria-hidden
                                  style={{
                                    marginRight: "6px",
                                    fontSize: "9px",
                                    color:
                                      row.tone === "aurora"
                                        ? "var(--aurora)"
                                        : row.tone === "ember"
                                          ? "var(--ember)"
                                          : row.tone === "warn"
                                            ? "var(--warn)"
                                            : "var(--frost)",
                                  }}
                                >
                                  {row.glyph}
                                </span>
                                {row.label}
                              </span>
                              <span style={{ fontWeight: row.ember ? 700 : 500 }}>{row.value}</span>
                            </div>
                          ))}
                        </div>
                        <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5, marginTop: "9px" }}>
                          {data.commercial.featured.completeness.footnote}
                        </div>
                      </div>
                      {data.commercial.featured.accounting !== null ? (
                        <div
                          className="icg-subpanel"
                          style={{ padding: "13px 15px", borderTop: "3px solid var(--ember)" }}
                        >
                          <div className="icg-label icg-label--md">YEAR-END ACCOUNTING STATUS</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-display)",
                                fontSize: "22px",
                                fontWeight: 600,
                                color: "var(--ember)",
                              }}
                            >
                              {data.commercial.featured.accounting.big}
                            </span>
                            <span className="icg-soft" style={{ fontSize: "12px" }}>
                              {data.commercial.featured.accounting.sub}
                            </span>
                          </div>
                          <div style={{ marginTop: "9px", display: "flex", flexDirection: "column", gap: "5px" }}>
                            {data.commercial.featured.accounting.rows.map((row) => (
                              <div
                                key={row.k}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "10px",
                                  fontSize: "11.5px",
                                }}
                              >
                                <span className="icg-soft">{row.k}</span>
                                <span style={{ fontWeight: 600, textAlign: "right" }} className="icg-num">
                                  {row.v}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5, marginTop: "9px" }}>
                            {data.commercial.featured.accounting.footnote}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Panel>
                ) : null}

                <Panel>
                  <PanelHead
                    title="All commercial chains"
                    sub="Component coverage per sales order — counts, never a confidence score."
                  />
                  <div className="icg-table-wrap">
                    <table className="icg-table">
                      <thead>
                        <tr>
                          <th scope="col">Sales order</th>
                          <th scope="col" className="icg-cell-right">
                            Present
                          </th>
                          <th scope="col">Required missing</th>
                          <th scope="col">Close link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.commercial.others.map((row) => (
                          <tr key={row.subject} data-selected={row.exceptionId !== null && exceptionId === row.exceptionId}>
                            <td>
                              {row.exceptionId !== null ? (
                                <button
                                  type="button"
                                  className="icg-row-btn"
                                  aria-label={`Open ${row.exceptionId} summary`}
                                  onClick={() => openException(row.exceptionId)}
                                />
                              ) : null}
                              <span className="icg-mono" style={{ fontSize: "11px" }}>
                                {row.subject}
                              </span>
                            </td>
                            <td className="icg-cell-money">{row.presence}</td>
                            <td style={{ fontSize: "11.5px" }}>
                              {row.note !== null ? (
                                <span style={{ color: "var(--ember)", fontWeight: 500 }}>{row.note}</span>
                              ) : (
                                <span className="icg-soft">None</span>
                              )}
                            </td>
                            <td>
                              {row.exceptionId !== null ? (
                                <span className="icg-mono" style={{ fontSize: "10px", color: "var(--frost)" }}>
                                  {row.exceptionId}
                                </span>
                              ) : (
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  No close exception
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            ) : null}

            {tab === "serial" ? (
              <>
                <Panel>
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <form action="/reconciliation" method="get" className="icg-lookup">
                      <span aria-hidden style={{ fontSize: "12px", color: "var(--quiet)" }}>
                        ⌕
                      </span>
                      <input
                        type="text"
                        name="serial"
                        defaultValue={data.serialTab.query}
                        aria-label="Serial lookup"
                        placeholder="Look up a serial…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="icg-lookup-hint">SERIAL LOOKUP</span>
                    </form>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span className="icg-soft" style={{ fontSize: "11.5px" }}>
                        Open-exception serials:
                      </span>
                      {data.serialTab.notable.map((serial) => (
                        <Link
                          key={serial}
                          href={`/reconciliation?serial=${serial}`}
                          className="icg-serial-chip"
                        >
                          {serial}
                        </Link>
                      ))}
                    </div>
                  </div>
                </Panel>

                {data.serialTab.notFound !== null ? (
                  <Panel>
                    <div style={{ padding: "14px 18px" }}>
                      <NoRecordsState note={data.serialTab.notFound} />
                    </div>
                  </Panel>
                ) : null}

                {data.serialTab.card !== null ? (
                  <SerialIntegrityCard card={data.serialTab.card} openException={openException} />
                ) : data.serialTab.notFound === null ? (
                  <Panel>
                    <div style={{ padding: "20px 18px" }}>
                      <div className="icg-state" role="status">
                        <span className="icg-state-glyph" aria-hidden>
                          ⌕
                        </span>
                        <div>
                          <div className="icg-state-title">Look up a serial</div>
                          <div className="icg-state-note">
                            Serial integrity connects the book listing, transaction chain, count
                            history and exceptions for one unit — with one-click access to its
                            Financial Life.
                          </div>
                        </div>
                      </div>
                    </div>
                  </Panel>
                ) : null}
              </>
            ) : null}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

function ProcurementCardView({
  card,
  openException,
}: {
  card: ProcurementCard;
  openException: (id: string | null) => void;
}) {
  return (
    <section className={`icg-proc-card${card.ember ? " icg-proc-card--ember" : ""}`}>
      <div className="icg-proc-head">
        <span className="icg-mono" style={{ fontSize: "11px", fontWeight: 600 }}>
          {card.po}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{card.title}</span>
        {card.qtyAmount !== null ? (
          <span className="icg-soft icg-num" style={{ fontSize: "11.5px" }}>
            {card.qtyAmount}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span className="icg-nstag">{card.nsTag}</span>
        {card.exceptionId !== null ? (
          <button
            type="button"
            className={`icg-close-capsule${card.close.variant === "aurora" ? " icg-close-capsule--aurora" : ""}`}
            onClick={() => openException(card.exceptionId)}
          >
            <span aria-hidden style={{ fontSize: "9px" }}>
              {card.close.glyph}
            </span>
            {card.close.label}
          </button>
        ) : (
          <span
            className={`icg-close-capsule${card.close.variant === "aurora" ? " icg-close-capsule--aurora" : ""}`}
          >
            <span aria-hidden style={{ fontSize: "9px" }}>
              {card.close.glyph}
            </span>
            {card.close.label}
          </span>
        )}
      </div>
      <div className="icg-proc-legs">
        {card.legs.map((leg) => (
          <div key={leg.label} className={`icg-proc-leg${leg.missing ? " icg-proc-leg--missing" : ""}`}>
            <span className="icg-proc-leg-label">
              <span aria-hidden style={{ fontSize: "9px" }}>
                {leg.glyph}
              </span>
              {leg.label}
            </span>
            <div className="icg-proc-leg-value">{leg.value}</div>
            <div className="icg-proc-leg-note">{leg.note}</div>
          </div>
        ))}
      </div>
      <div className="icg-proc-foot">
        <span
          aria-hidden
          style={{
            color: card.footnote.tone === "ember" ? "var(--ember)" : "var(--aurora)",
            fontSize: "11px",
          }}
        >
          {card.footnote.glyph}
        </span>
        <span>{card.footnote.text}</span>
      </div>
    </section>
  );
}

function SerialIntegrityCard({
  card,
  openException,
}: {
  card: NonNullable<ReconciliationData["serialTab"]["card"]>;
  openException: (id: string | null) => void;
}) {
  return (
    <>
      <Panel>
        <div
          className="icg-objhead"
          style={
            {
              borderTop: "3px solid var(--ember)",
              "--icg-objhead-cols": "1fr 280px",
            } as CSSProperties
          }
        >
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
              <span
                style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 600 }}
                className="icg-mono"
              >
                {card.serial}
              </span>
              <span
                className="icg-mono"
                style={{
                  fontSize: "10.5px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  border: "1px solid var(--hair)",
                  background: "var(--panel-3)",
                }}
              >
                SKU {card.sku}
              </span>
              {card.carrying !== null ? (
                <span className="icg-soft icg-num" style={{ fontSize: "12px" }}>
                  Carrying value {card.carrying}
                </span>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--ember)", fontWeight: 600 }}>
                  Not on the year-end book
                </span>
              )}
            </div>
            <div className="icg-facts" style={{ "--icg-facts-cols": 3 } as CSSProperties}>
              {card.facts.map((f) => (
                <div key={f.label}>
                  <div className="icg-label">{f.label}</div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      marginTop: "3px",
                      color: f.ember ? "var(--ember)" : undefined,
                    }}
                  >
                    {f.value}
                  </div>
                  <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.45 }}>
                    {f.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="icg-objhead-rail">
            <div className="icg-label icg-label--md" style={{ marginBottom: "6px" }}>
              JUMP TO
            </div>
            {card.jump.map((j) => (
              <Link key={j.label} href={j.href} className="icg-jump">
                <span>{j.label}</span>
                <span className="icg-jump-meta">
                  {j.meta} <span aria-hidden>↗</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Panel>

      <div className="icg-split" style={{ "--icg-split-cols": "1.3fr 1fr" } as CSSProperties}>
        <Panel>
          <PanelHead title="Transaction chain" />
          <div style={{ padding: "8px 16px 12px" }}>
            {card.chainRows.map((row) => (
              <div
                key={row.type + row.value}
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 130px",
                  gap: "10px",
                  alignItems: "baseline",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--hair)",
                  color: row.missing ? "var(--ember)" : undefined,
                  fontWeight: row.missing ? 700 : undefined,
                }}
              >
                <span className="icg-mono" style={{ fontSize: "10.5px", color: row.missing ? "var(--ember)" : "var(--soft)" }}>
                  {row.type}
                </span>
                <span style={{ fontSize: "12px" }}>{row.value}</span>
                <span
                  className="icg-mono"
                  style={{ fontSize: "9px", textAlign: "right", letterSpacing: "0.05em" }}
                >
                  <span aria-hidden style={{ marginRight: "4px" }}>
                    {row.glyph}
                  </span>
                  {row.state}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Related exceptions" />
          <div style={{ padding: "8px 16px 14px", display: "flex", flexDirection: "column", gap: "7px" }}>
            {card.related.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openException(r.id)}
                style={{
                  border: "1px solid var(--ember-line)",
                  background: "var(--ember-bg)",
                  borderRadius: "6px",
                  padding: "9px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="icg-mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--ember)" }}>
                    {r.id}
                  </span>
                  <StatusCapsule status={r.status} />
                  <span style={{ flex: 1 }} />
                  <span className="icg-num" style={{ fontSize: "12px", fontWeight: 600 }}>
                    {r.exposure}
                  </span>
                </div>
                <div className="icg-soft" style={{ fontSize: "11.5px", marginTop: "3px" }}>
                  {r.note}
                </div>
              </button>
            ))}
            {card.relatedEmpty !== null ? (
              <div
                style={{
                  border: "1.5px dashed var(--hair-2)",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontSize: "11.5px",
                  color: "var(--soft)",
                  lineHeight: 1.5,
                }}
              >
                {card.relatedEmpty}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
