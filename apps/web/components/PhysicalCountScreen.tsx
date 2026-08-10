"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { CountTestRow, PhysicalCountData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { ExceptionDrawer } from "./ExceptionDrawer";
import {
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  RiskIndicator,
  ScopeNotice,
  StatusCapsule,
  TabBar,
} from "./kit";

const TABS = [
  { key: "year-end", label: "Year-End Count" },
  { key: "cycle", label: "Cycle Count History" },
  { key: "tests", label: "Auditor Test Counts" },
  { key: "movements", label: "Count Movements" },
] as const;

/**
 * Physical Count (stage 06) — year-end command center, cycle history,
 * auditor test counts, count movements. The cycle lens is management risk
 * context only; there is no sampling language and no sample generation.
 */
export function PhysicalCountScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: PhysicalCountData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>("year-end");
  const [openId, setOpenId] = useState<string | null>(null);
  const drawerData = openId !== null ? data.drawers[openId] : undefined;

  const tabs = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count:
      t.key === "year-end"
        ? data.variances.length > 0
          ? String(data.variances.length)
          : null
        : t.key === "cycle"
          ? String(data.cycle.rows.length)
          : t.key === "tests"
            ? String(data.auditorTests.length)
            : String(data.movements.length),
  }));

  return (
    <AppShell
      shell={shell}
      section="Physical Count"
      setRoleAction={setRoleAction}
      drawerOpen={drawerData !== undefined}
      onCloseDrawer={() => setOpenId(null)}
      drawer={
        drawerData !== undefined ? (
          <ExceptionDrawer data={drawerData} onClose={() => setOpenId(null)} />
        ) : undefined
      }
      askSuggestions={[
        "What caused the first-pass variances?",
        "Which count issues are still open?",
        "What moved during the count window?",
      ]}
      askContext="FY2026 Inventory Close · Physical Count"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Physical Count</h1>
            <div className="icg-page-context">
              {data.planNote ?? "FY2026 · balance-sheet date Dec. 31, 2026"}
            </div>
          </div>
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="physical count data" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={tabs}
                active={tab}
                onSelect={setTab}
                label="Physical Count tabs"
                panelId="icg-count-panel"
              />
            </Panel>

            <div
              id="icg-count-panel"
              role="tabpanel"
              aria-labelledby={`icg-count-panel-tab-${tab}`}
              style={{ display: "contents" }}
            >
            {tab === "year-end" ? (
              <>
                <div className="icg-kpis icg-kpis--narrow">
                  {data.stats.map((s) => (
                    <div key={s.label} className="icg-kpi">
                      <div className="icg-label">{s.label}</div>
                      <div
                        className="icg-kpi-value icg-num"
                        style={s.tone === "warn" ? { color: "var(--warn)" } : undefined}
                      >
                        {s.value}
                      </div>
                      <div className={`icg-kpi-note${s.warnNote === true ? " icg-warn" : ""}`}>
                        {s.note}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="icg-split"
                  style={{ "--icg-split-cols": "1fr 1.6fr" } as CSSProperties}
                >
                  <Panel>
                    <PanelHead
                      title="Count population by location"
                      sub="Snapshot quantities from the year-end count sheets"
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Location</th>
                            <th scope="col" className="icg-cell-right">
                              Units
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.locations.map((row) => (
                            <tr key={row.label}>
                              <td style={{ fontSize: "12.5px" }}>{row.label}</td>
                              <td className="icg-cell-money">{row.units}</td>
                            </tr>
                          ))}
                        </tbody>
                        {data.locationTotal !== null ? (
                          <tfoot>
                            <tr>
                              <td style={{ fontWeight: 600, fontSize: "12px" }}>Population</td>
                              <td className="icg-cell-money" style={{ fontWeight: 700 }}>
                                {data.locationTotal}
                              </td>
                            </tr>
                          </tfoot>
                        ) : null}
                      </table>
                    </div>
                  </Panel>

                  <Panel>
                    <PanelHead
                      title="Count variance workspace"
                      sub="First-pass variance rows. The row opens the exception; the serial opens Financial Life."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Subject</th>
                            <th scope="col">Location · bin</th>
                            <th scope="col" className="icg-cell-right">
                              Book
                            </th>
                            <th scope="col" className="icg-cell-right">
                              First count
                            </th>
                            <th scope="col" className="icg-cell-right">
                              Variance
                            </th>
                            <th scope="col" className="icg-cell-right">
                              Exposure
                            </th>
                            <th scope="col">Status</th>
                            <th scope="col">Owner</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.variances.map((row) => (
                            <tr
                              key={row.key}
                              data-selected={
                                row.exceptionId !== null && openId === row.exceptionId
                              }
                            >
                              <td>
                                {row.exceptionId !== null ? (
                                  <button
                                    type="button"
                                    className="icg-row-btn"
                                    aria-label={`Open ${row.exceptionId} summary`}
                                    onClick={() => setOpenId(row.exceptionId)}
                                  />
                                ) : null}
                                {row.subjectMono ? (
                                  <Link
                                    href={`/inventory/${row.subject}`}
                                    className="icg-row-link icg-row-id"
                                  >
                                    {row.subject}
                                  </Link>
                                ) : (
                                  <span style={{ fontSize: "12px" }}>{row.subject}</span>
                                )}
                              </td>
                              <td style={{ fontSize: "12px" }}>
                                {row.location}
                                <span className="icg-mono icg-quiet" style={{ fontSize: "9.5px" }}>
                                  {" "}
                                  · {row.bin}
                                </span>
                              </td>
                              <td className="icg-cell-money">{row.book}</td>
                              <td className="icg-cell-money">{row.counted}</td>
                              <td
                                className="icg-cell-money"
                                style={{ color: "var(--ember)", fontWeight: 600 }}
                              >
                                {row.variance}
                              </td>
                              <td className="icg-cell-money">{row.exposure ?? "—"}</td>
                              <td>
                                {row.status !== null ? <StatusCapsule status={row.status} /> : "—"}
                                {row.risk !== null ? (
                                  <span style={{ marginLeft: "5px" }}>
                                    <RiskIndicator risk={row.risk} outline />
                                  </span>
                                ) : null}
                              </td>
                              <td style={{ fontSize: "11.5px" }}>{row.owner ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px" }}>
                        These are management&apos;s first-pass count differences. Each row keeps
                        its own conclusion and owner; the count did not resolve them.
                      </span>
                    </div>
                  </Panel>
                </div>

                {data.discovery !== null ? (
                  <Panel>
                    <div
                      style={{
                        margin: "12px 18px",
                        border: "1.5px dashed var(--ember)",
                        background: "var(--ember-bg)",
                        borderRadius: "6px",
                        padding: "12px 15px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "9px",
                        }}
                      >
                        <span className="icg-label icg-label--md" style={{ color: "var(--ember)" }}>
                          FLOOR → SHEET DISCOVERY
                        </span>
                        <Link
                          href={`/inventory/${data.discovery.serial}`}
                          className="icg-mono"
                          style={{ fontSize: "12px", fontWeight: 700, color: "var(--ember)" }}
                        >
                          {data.discovery.serial}
                        </Link>
                        <span className="icg-soft" style={{ fontSize: "11.5px" }}>
                          {data.discovery.location}
                          {data.discovery.bin !== null ? ` · bin ${data.discovery.bin}` : ""} ·
                          test {data.discovery.testId}
                        </span>
                        {data.discovery.exceptionId !== null ? (
                          <button
                            type="button"
                            className="icg-chip-inline"
                            onClick={() => setOpenId(data.discovery?.exceptionId ?? null)}
                          >
                            <span className="icg-chip-inline-id">
                              {data.discovery.exceptionId}
                              {data.discovery.exposure !== null
                                ? ` · ${data.discovery.exposure}`
                                : ""}
                            </span>
                          </button>
                        ) : null}
                        {data.discovery.status !== null ? (
                          <StatusCapsule status={data.discovery.status} />
                        ) : null}
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          lineHeight: 1.55,
                          margin: "7px 0 0",
                          color: "var(--ember)",
                          fontWeight: 500,
                        }}
                      >
                        {data.discovery.observation}. The unit is physically present and absent
                        from the listing — it is never auto-added to inventory.
                      </p>
                    </div>
                  </Panel>
                ) : null}
              </>
            ) : null}

            {tab === "cycle" ? (
              <>
                <Panel>
                  <PanelHead
                    title="Management indicators"
                    sub="Deterministic signals from the count history — a management risk lens, never auditor reliance or sampling."
                    right={
                      <span
                        className="icg-mono"
                        style={{
                          fontSize: "9px",
                          letterSpacing: "0.06em",
                          color: "var(--warn)",
                          border: "1px solid var(--warn-line)",
                          borderRadius: "3px",
                          padding: "3px 7px",
                        }}
                      >
                        MANAGEMENT RISK CONTEXT
                      </span>
                    }
                  />
                  <div style={{ padding: "10px 18px 14px" }}>
                    {data.cycle.indicators === null ? (
                      <ScopeNotice text="The management risk lens is not auditor-facing. Provided audit support lives in the Audit Package." />
                    ) : data.cycle.indicators.length === 0 ? (
                      <NoRecordsState note="No management indicators for this history — verified empty, not assumed." />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                        {data.cycle.indicators.map((ind) => (
                          <div
                            key={ind.title + ind.why}
                            style={{
                              border: "1px solid var(--warn-line)",
                              background: "var(--warn-bg)",
                              borderRadius: "6px",
                              padding: "9px 12px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ fontSize: "12.5px", fontWeight: 600 }}>
                                <span aria-hidden style={{ marginRight: "6px" }}>
                                  ◆
                                </span>
                                {ind.title}
                              </span>
                              <span className="icg-mono icg-soft" style={{ fontSize: "9.5px" }}>
                                {ind.rule}
                              </span>
                            </div>
                            <div
                              className="icg-soft"
                              style={{ fontSize: "11.5px", lineHeight: 1.5, marginTop: "3px" }}
                            >
                              {ind.why}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Panel>

                <Panel>
                  <PanelHead
                    title="NetSuite cycle count history"
                    sub="Snapshot, count, variance, recount, approval, adjustment trace, and next count — sourced from NetSuite inventory-count records."
                  />
                  <div className="icg-table-wrap">
                    <table className="icg-table">
                      <thead>
                        <tr>
                          <th scope="col">Count date</th>
                          <th scope="col">Count #</th>
                          <th scope="col">Type</th>
                          <th scope="col">Item</th>
                          <th scope="col">Location · bin</th>
                          <th scope="col" className="icg-cell-right">
                            Snapshot
                          </th>
                          <th scope="col" className="icg-cell-right">
                            Counted
                          </th>
                          <th scope="col" className="icg-cell-right">
                            Variance
                          </th>
                          <th scope="col">Recount</th>
                          <th scope="col">Approval</th>
                          <th scope="col">Adjustment</th>
                          <th scope="col">Next count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cycle.rows.map((row) => (
                          <tr key={row.key}>
                            <td className="icg-num" style={{ whiteSpace: "nowrap" }}>
                              {row.countDate}
                            </td>
                            <td>
                              <span className="icg-mono icg-soft" style={{ fontSize: "10px" }}>
                                {row.planExternal ?? row.plan}
                              </span>
                            </td>
                            <td style={{ fontSize: "11px" }}>{row.countType}</td>
                            <td>
                              <span className="icg-mono" style={{ fontSize: "11px" }}>
                                {row.sku}
                              </span>
                              {row.serial !== null ? (
                                <span className="icg-mono icg-quiet" style={{ fontSize: "9.5px" }}>
                                  {" "}
                                  · {row.serial}
                                </span>
                              ) : null}
                            </td>
                            <td style={{ fontSize: "11.5px" }}>
                              {row.location}
                              {row.bin !== null ? (
                                <span className="icg-mono icg-quiet" style={{ fontSize: "9.5px" }}>
                                  {" "}
                                  · {row.bin}
                                </span>
                              ) : null}
                            </td>
                            <td className="icg-cell-money">{row.snapshot}</td>
                            <td className="icg-cell-money">{row.counted}</td>
                            <td
                              className="icg-cell-money"
                              style={
                                row.varianceWarn
                                  ? { color: "var(--ember)", fontWeight: 600 }
                                  : undefined
                              }
                            >
                              {row.variance}
                            </td>
                            <td>
                              <span className="icg-mono icg-soft" style={{ fontSize: "10px" }}>
                                {row.recount}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: "10.5px",
                                  color:
                                    row.approval.tone === "aurora"
                                      ? "var(--aurora)"
                                      : row.approval.tone === "ember"
                                        ? "var(--ember)"
                                        : "var(--soft)",
                                }}
                              >
                                <span aria-hidden style={{ fontSize: "8px", marginRight: "4px" }}>
                                  {row.approval.glyph}
                                </span>
                                {row.approval.label}
                              </span>
                            </td>
                            <td>
                              <span className="icg-mono icg-soft" style={{ fontSize: "10px" }}>
                                {row.adjustment ?? "None"}
                              </span>
                            </td>
                            <td className="icg-num" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                              {row.nextDue ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="icg-panel-foot">
                    <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.5 }}>
                      Cycle-count history is a management risk lens. It is not an audit sampling
                      method and implies no auditor reliance on these counts.
                    </span>
                  </div>
                </Panel>
              </>
            ) : null}

            {tab === "tests" ? (
              <>
                <Panel>
                  <PanelHead
                    large
                    title="External auditor test counts"
                    sub="Selections supplied by the external audit team — recorded and supported here, never generated or chosen by Gaurd."
                    right={
                      data.testSummary !== null ? (
                        <span className="icg-quiet icg-num" style={{ fontSize: "10.5px" }}>
                          {data.testSummary.auditor}
                        </span>
                      ) : undefined
                    }
                  />
                  <TestTable rows={data.auditorTests} openDrawer={setOpenId} />
                  <div className="icg-panel-foot">
                    <span className="icg-soft" style={{ fontSize: "11px" }}>
                      Sheet → Floor selections principally support Existence; Floor → Sheet
                      selections principally support Completeness. Gaurd records and supports
                      these selections; it never makes them.
                    </span>
                  </div>
                </Panel>
                <Panel>
                  <PanelHead
                    title="Management test counts"
                    sub="Management's own control — a separate selection, kept apart from the auditor's."
                    right={
                      data.testSummary !== null ? (
                        <span className="icg-quiet icg-num" style={{ fontSize: "10.5px" }}>
                          {data.testSummary.management}
                        </span>
                      ) : undefined
                    }
                  />
                  <TestTable rows={data.managementTests} openDrawer={setOpenId} />
                </Panel>
              </>
            ) : null}

            {tab === "movements" ? (
              <Panel>
                <PanelHead
                  large
                  title="Count-period movements"
                  sub="Controlled movements during the count window — each authorized and reasoned."
                />
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Item</th>
                        <th scope="col" className="icg-cell-right">
                          Qty
                        </th>
                        <th scope="col">From → To</th>
                        <th scope="col">Moved</th>
                        <th scope="col">Authorized by</th>
                        <th scope="col">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((m) => (
                        <tr
                          key={m.id}
                          data-selected={m.exceptionId !== null && openId === m.exceptionId}
                        >
                          <td>
                            {m.exceptionId !== null ? (
                              <button
                                type="button"
                                className="icg-row-btn"
                                aria-label={`Open ${m.exceptionId} summary`}
                                onClick={() => setOpenId(m.exceptionId)}
                              />
                            ) : null}
                            <span className="icg-mono" style={{ fontSize: "11px" }}>
                              {m.id}
                            </span>
                          </td>
                          <td>
                            <span className="icg-mono" style={{ fontSize: "11px" }}>
                              {m.subject}
                            </span>
                          </td>
                          <td className="icg-cell-money">{m.qty}</td>
                          <td style={{ fontSize: "12px" }}>
                            {m.from} → {m.to}
                          </td>
                          <td className="icg-num" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                            {m.movedAt}
                          </td>
                          <td style={{ fontSize: "11.5px" }}>{m.authorizedBy}</td>
                          <td className="icg-soft" style={{ fontSize: "11.5px" }}>
                            {m.reason}
                            {m.exceptionId !== null ? (
                              <span className="icg-mono" style={{ fontSize: "9.5px", marginLeft: "6px", color: "var(--frost)" }}>
                                {m.exceptionId}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

function TestTable({
  rows,
  openDrawer,
}: {
  rows: readonly CountTestRow[];
  openDrawer: (id: string) => void;
}) {
  return (
    <div className="icg-table-wrap">
      <table className="icg-table">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Direction · assertion</th>
            <th scope="col">Item</th>
            <th scope="col">Location · bin</th>
            <th scope="col">Recorded</th>
            <th scope="col">Observation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <span className="icg-mono" style={{ fontSize: "11px" }}>
                  {t.id}
                </span>
              </td>
              <td style={{ fontSize: "11.5px" }}>{t.directionLabel}</td>
              <td>
                <span className="icg-mono" style={{ fontSize: "11px" }}>
                  {t.serial ?? t.sku}
                </span>
              </td>
              <td style={{ fontSize: "11.5px" }}>
                {t.location}
                {t.bin !== null ? (
                  <span className="icg-mono icg-quiet" style={{ fontSize: "9.5px" }}>
                    {" "}
                    · {t.bin}
                  </span>
                ) : null}
              </td>
              <td className="icg-num" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                {t.recorded}
              </td>
              <td className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.45 }}>
                {t.traced ? (
                  <span aria-hidden style={{ color: "var(--aurora)", marginRight: "5px" }}>
                    ✓
                  </span>
                ) : (
                  <span aria-hidden style={{ color: "var(--ember)", marginRight: "5px" }}>
                    ○
                  </span>
                )}
                {t.observation}
                {t.exceptionId !== null ? (
                  <button
                    type="button"
                    className="icg-chip-inline"
                    style={{ marginLeft: "7px" }}
                    onClick={() => openDrawer(t.exceptionId ?? "")}
                  >
                    <span className="icg-chip-inline-id">{t.exceptionId}</span>
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
