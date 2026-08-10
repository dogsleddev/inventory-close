"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { OverviewData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { ExceptionDrawer } from "./ExceptionDrawer";
import {
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  RiskIndicator,
  StatusCapsule,
} from "./kit";

/**
 * Overview (design 02). Answers in the first screen: are we ready · what
 * blocks it · how much exposure · does it tie · what is mine next. Every
 * figure arrives pre-formatted from the server assembly of @icg/services
 * output — this component holds layout only.
 */
export function OverviewScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: OverviewData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const drawerData = openId !== null ? data.drawers?.[openId] : undefined;

  return (
    <AppShell
      shell={shell}
      section="Overview"
      setRoleAction={setRoleAction}
      drawerOpen={drawerData !== undefined}
      onCloseDrawer={() => setOpenId(null)}
      drawer={
        drawerData !== undefined ? (
          <ExceptionDrawer data={drawerData} onClose={() => setOpenId(null)} />
        ) : undefined
      }
      // The five defaults from prompts/design/06 Part B.
      askSuggestions={[
        "What prevents Controller sign-off?",
        "Why doesn't inventory tie?",
        "Show largest unresolved exposures.",
        "Which evidence is still missing?",
        "Which PBC items are not ready?",
      ]}
      askContext="FY2026 Inventory Close · Overview"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Overview</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date Dec. 31, 2026 · synthetic demo dataset
            </div>
          </div>
        </div>

        {data.restricted || data.gate === undefined ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="close data" />
            </div>
          </Panel>
        ) : (
          <>
            {/* Sign-off gate — the single canonical gate (design 07 note). */}
            <Panel decision className="icg-gate">
              <div className="icg-gate-left">
                <div className="icg-gate-state">
                  <span aria-hidden>◆</span>
                  <span>NOT READY FOR MANAGEMENT SIGN-OFF</span>
                </div>
                <div className="icg-gate-readiness">
                  <div className="icg-gate-pct">{data.gate.readinessOverview}</div>
                  <div style={{ paddingBottom: "6px" }}>
                    <div className="icg-soft" style={{ fontSize: "12px" }}>
                      Close Readiness
                    </div>
                    <div className="icg-mono icg-quiet" style={{ fontSize: "10px" }}>
                      {data.gate.bps} bps · weighted management metric
                    </div>
                  </div>
                </div>
                <div className="icg-gate-bar" aria-hidden>
                  {data.gate.categories.map((c) => (
                    <div key={c.key} className="icg-gate-bar-seg" style={{ flex: c.weight }}>
                      <div
                        className="icg-gate-bar-fill"
                        style={{
                          width: `${c.fillPct}%`,
                          background: `var(--${c.tone === "ink" ? "ink" : c.tone})`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.5 }}>
                  Eight weighted close areas. Readiness is a management workflow measure — it
                  is not audit assurance or a statement of financial-statement accuracy.
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
                  <Link
                    href="/exceptions/EXC-001"
                    className="icg-btn icg-btn--primary"
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    Review highest-risk cutoff item
                  </Link>
                  <div
                    className="icg-action-conclude"
                    style={{ display: "flex", flexDirection: "column", gap: "2px" }}
                  >
                    <button type="button" className="icg-btn icg-btn--disabled" disabled>
                      Record management sign-off
                    </button>
                    <span className="icg-btn-reason">
                      Unavailable — {data.gate.blockerCount} blockers open
                    </span>
                  </div>
                </div>
              </div>
              <div className="icg-gate-right">
                {data.gate.stats.map((s) => (
                  <div key={s.label}>
                    <div className="icg-label">{s.label}</div>
                    <div
                      className="icg-gate-stat-value"
                      style={
                        s.tone === "ember"
                          ? { color: "var(--ember)" }
                          : s.tone === "warn"
                            ? { color: "var(--warn)" }
                            : undefined
                      }
                    >
                      {s.value}
                    </div>
                    <div
                      className="icg-kpi-note"
                      style={s.warnNote === true ? { color: "var(--warn)" } : undefined}
                    >
                      {s.warnNote === true ? <span aria-hidden>◔ </span> : null}
                      {s.note}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div
              className="icg-split"
              style={
                {
                  "--icg-split-cols": drawerData !== undefined ? "1fr" : "1.62fr 1fr",
                } as CSSProperties
              }
            >
              {/* Preventing Sign-Off */}
              {data.preventing !== undefined ? (
                <Panel decision>
                  <PanelHead
                    large
                    title="Preventing Sign-Off"
                    sub="Each item needs a management conclusion. Ordered by exposure."
                    right={
                      <div style={{ textAlign: "right" }}>
                        <div className="icg-num" style={{ fontSize: "12px", fontWeight: 600 }}>
                          {data.preventing.shownTotal} shown
                        </div>
                        <div className="icg-quiet icg-num" style={{ fontSize: "10.5px" }}>
                          of {data.preventing.allTotal} across {data.preventing.blockerCount}{" "}
                          blockers
                        </div>
                      </div>
                    }
                  />
                  <div className="icg-table-wrap">
                    <table className="icg-table">
                      <thead>
                        <tr>
                          <th scope="col">ID</th>
                          <th scope="col">Issue &amp; next action</th>
                          <th scope="col">Owner</th>
                          <th scope="col" className="icg-cell-right">
                            Exposure
                          </th>
                          <th scope="col">Risk · status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.preventing.rows.map((row) => (
                          <tr key={row.id} data-selected={openId === row.id}>
                            <td>
                              <button
                                type="button"
                                className="icg-row-btn"
                                aria-label={`Open ${row.id} summary`}
                                onClick={() => setOpenId(row.id)}
                              />
                              <Link
                                href={`/exceptions/${row.id}`}
                                className="icg-row-link icg-row-id"
                              >
                                {row.id}
                              </Link>
                            </td>
                            <td>
                              <div style={{ fontWeight: 500, lineHeight: 1.35 }}>
                                {row.title}
                              </div>
                              <div
                                className="icg-soft"
                                style={{ fontSize: "11px", marginTop: "2px" }}
                              >
                                Next: {row.nextAction}
                              </div>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: "10.5px",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  background: "var(--frost-bg)",
                                  color: "var(--frost)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {row.owner}
                              </span>
                            </td>
                            <td className="icg-cell-money" style={{ fontSize: "13px" }}>
                              {row.exposure}
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
                                <RiskIndicator risk={row.risk} />
                                <StatusCapsule status={row.status} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="icg-panel-foot">
                    <span className="icg-soft" style={{ fontSize: "11px" }}>
                      {data.preventing.remainingNote}
                    </span>
                    <Link href="/exceptions" style={{ fontSize: "12px", fontWeight: 600 }}>
                      View all {data.preventing.blockerCount} blockers →
                    </Link>
                  </div>
                </Panel>
              ) : null}

              {/* Needs attention + activity */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <Panel>
                  <PanelHead
                    title="Needs your attention"
                    right={
                      <span className="icg-label">
                        {data.roleLabel.toUpperCase()}
                      </span>
                    }
                  />
                  {data.attention !== undefined && data.attention.items.length > 0 ? (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {data.attention.items.map((item) => (
                        <li
                          key={item.ref + item.label}
                          style={{ borderBottom: "1px solid var(--hair)" }}
                        >
                          <Link
                            href={`/exceptions/${item.ref}`}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "9px",
                              padding: "9px 16px",
                              color: "inherit",
                              textDecoration: "none",
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                fontSize: "9px",
                                paddingTop: "3px",
                                color:
                                  item.tone === "ember-strong"
                                    ? "var(--ember-strong)"
                                    : item.tone === "warn"
                                      ? "var(--warn)"
                                      : "var(--frost)",
                              }}
                            >
                              {item.glyph}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "12.5px",
                                  fontWeight: 500,
                                }}
                              >
                                {item.label}
                              </span>
                              <span
                                className="icg-soft"
                                style={{ display: "block", fontSize: "11px", marginTop: "1px" }}
                              >
                                {item.detail}
                              </span>
                            </span>
                            <span className="icg-id" style={{ paddingTop: "2px" }}>
                              {item.ref}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ padding: "14px 16px" }}>
                      <NoRecordsState
                        note={
                          data.attention?.auditorNote ??
                          "Nothing in your queue for this close."
                        }
                      />
                    </div>
                  )}
                  {data.attention !== undefined && data.attention.items.length > 0 ? (
                    <div style={{ padding: "9px 16px" }}>
                      <Link href="/exceptions" style={{ fontSize: "12px", fontWeight: 600 }}>
                        Open my work queue →
                      </Link>
                    </div>
                  ) : null}
                </Panel>

                <Panel>
                  <PanelHead
                    title="Recent meaningful changes"
                    right={<span className="icg-label">WORKFLOW HISTORY</span>}
                  />
                  {data.activity !== undefined && data.activity.length > 0 ? (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {data.activity.map((e) => (
                        <li
                          key={e.when + e.label}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "9px",
                            padding: "8px 16px",
                            borderBottom: "1px solid var(--hair)",
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              fontSize: "9px",
                              paddingTop: "3px",
                              color:
                                e.tone === "aurora"
                                  ? "var(--aurora)"
                                  : e.tone === "warn"
                                    ? "var(--warn)"
                                    : "var(--frost)",
                            }}
                          >
                            {e.glyph}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px" }}>{e.label}</div>
                            <div
                              className="icg-quiet"
                              style={{
                                fontSize: "10.5px",
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {e.detail} · {e.by}
                            </div>
                          </div>
                          <span
                            className="icg-mono icg-quiet icg-num"
                            style={{ fontSize: "10px", whiteSpace: "nowrap", paddingTop: "1px" }}
                          >
                            {e.when}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ padding: "14px 16px" }}>
                      <NoRecordsState note="No workflow events recorded yet." />
                    </div>
                  )}
                  <div className="icg-quiet" style={{ padding: "8px 16px", fontSize: "10.5px" }}>
                    Material workflow events only. Full append-only history sits under each
                    object&rsquo;s Audit Details.
                  </div>
                </Panel>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: drawerData !== undefined ? "1fr" : "1.62fr 1fr",
                gap: "12px",
                alignItems: "start",
              }}
            >
              {/* Close areas */}
              {data.closeAreas !== undefined ? (
                <Panel>
                  <PanelHead
                    title="Close areas"
                    right={
                      <span className="icg-soft icg-num" style={{ fontSize: "11px" }}>
                        {data.closeAreas.weightedResult}
                      </span>
                    }
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                    {data.closeAreas.categories.map((a) => (
                      <div
                        key={a.key}
                        style={{
                          padding: "9px 18px",
                          borderBottom: "1px solid var(--hair)",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
                            <span style={{ fontSize: "12.5px", fontWeight: 500 }}>
                              {a.label}
                            </span>
                            <span className="icg-mono icg-quiet" style={{ fontSize: "9px" }}>
                              {a.weightPct}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              marginTop: "1px",
                              color: a.noteWarn ? "var(--warn)" : "var(--soft)",
                            }}
                          >
                            {a.note}
                          </div>
                        </div>
                        <div style={{ width: "74px", flexShrink: 0 }}>
                          <div
                            className="icg-num"
                            style={{ fontSize: "13px", fontWeight: 600, textAlign: "right" }}
                          >
                            {a.score}
                          </div>
                          <div
                            aria-hidden
                            style={{
                              height: "3px",
                              background: "var(--hair)",
                              borderRadius: "2px",
                              marginTop: "3px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${a.fillPct}%`,
                                background: `var(--${a.tone === "ink" ? "ink" : a.tone})`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Inventory to GL */}
                {data.glPanel !== undefined ? (
                  <Panel>
                    <div style={{ padding: "14px 18px" }}>
                      <h2
                        className="icg-panel-title"
                        style={{ fontSize: "15px", marginBottom: "8px" }}
                      >
                        Inventory to GL — gross
                      </h2>
                      <div className="icg-kv">
                        <span className="icg-kv-key">Gross GL balance</span>
                        <span className="icg-kv-val">{data.glPanel.grossGl}</span>
                      </div>
                      <div className="icg-kv">
                        <span className="icg-kv-key">Gross subledger</span>
                        <span className="icg-kv-val">{data.glPanel.grossSubledger}</span>
                      </div>
                      <div
                        className="icg-kv"
                        style={{
                          borderTop: "1px solid var(--hair)",
                          marginTop: "3px",
                          paddingTop: "6px",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Current GL difference</span>
                        <span
                          className="icg-num"
                          style={{ fontWeight: 700, color: "var(--warn)" }}
                        >
                          {data.glPanel.difference}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12px",
                          padding: "6px 10px",
                          marginTop: "7px",
                          border: "1px dashed var(--hair-2)",
                          borderRadius: "5px",
                        }}
                      >
                        <span className="icg-soft">
                          Potential adjusted difference{" "}
                          <span className="icg-quiet" style={{ fontSize: "10px" }}>
                            · {data.glPanel.proposedCount} proposed, none posted
                          </span>
                        </span>
                        <span className="icg-num" style={{ fontWeight: 700 }}>
                          {data.glPanel.potentialAdjusted}
                        </span>
                      </div>
                    </div>
                  </Panel>
                ) : null}

                {/* PBC package */}
                <Panel>
                  {data.pbcPanel !== undefined && !("restricted" in data.pbcPanel && data.pbcPanel.restricted) ? (
                    <div style={{ padding: "14px 18px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: "9px",
                        }}
                      >
                        <h2 className="icg-panel-title" style={{ fontSize: "15px" }}>
                          PBC package
                        </h2>
                        <span className="icg-soft icg-num" style={{ fontSize: "11.5px" }}>
                          {"summary" in data.pbcPanel ? data.pbcPanel.summary : ""}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {"rows" in data.pbcPanel
                          ? data.pbcPanel.rows.map((r) => (
                              <div
                                key={r.label}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  fontSize: "12px",
                                }}
                              >
                                <span
                                  aria-hidden
                                  style={{
                                    fontSize: "10px",
                                    width: "12px",
                                    color:
                                      r.tone === "aurora"
                                        ? "var(--aurora)"
                                        : r.tone === "frost"
                                          ? "var(--frost)"
                                          : r.tone === "warn"
                                            ? "var(--warn)"
                                            : "var(--quiet)",
                                  }}
                                >
                                  {r.glyph}
                                </span>
                                <span className="icg-soft" style={{ flex: 1 }}>
                                  {r.label}
                                </span>
                                <span className="icg-num" style={{ fontWeight: 600 }}>
                                  {r.count}
                                </span>
                              </div>
                            ))
                          : null}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "14px 18px" }}>
                      <RestrictedState roleLabel={data.roleLabel} what="the PBC package" />
                    </div>
                  )}
                </Panel>

                {/* Source health */}
                {data.sourceHealth !== undefined ? (
                  <Panel>
                    <PanelHead
                      title="Data & control health"
                      right={
                        <span className="icg-soft icg-num" style={{ fontSize: "11px" }}>
                          {data.sourceHealth.summary}
                        </span>
                      }
                    />
                    <div
                      style={{
                        padding: "11px 16px",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "4px 10px",
                      }}
                    >
                      {data.sourceHealth.rows.map((s) => (
                        <div
                          key={s.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "7px",
                            fontSize: "11.5px",
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              fontSize: "8px",
                              width: "9px",
                              color: s.variant === "healthy" ? "var(--aurora)" : "var(--warn)",
                            }}
                          >
                            {s.glyph}
                          </span>
                          <span
                            className="icg-soft"
                            style={{
                              flex: 1,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {s.name}
                          </span>
                          <span
                            className="icg-mono"
                            style={{
                              fontSize: "9px",
                              letterSpacing: "0.06em",
                              color: s.variant === "healthy" ? "var(--aurora)" : "var(--warn)",
                            }}
                          >
                            {s.state}
                          </span>
                        </div>
                      ))}
                    </div>
                    {data.sourceHealth.callout !== null ? (
                      <div className="icg-callout--warn" style={{ margin: "0 16px 14px" }}>
                        <div className="icg-callout-head">
                          <span aria-hidden style={{ fontSize: "9px" }}>
                            ◔
                          </span>
                          {data.sourceHealth.callout.title}
                        </div>
                        <div className="icg-callout-body">
                          {data.sourceHealth.callout.body}{" "}
                          {data.sourceHealth.callout.affected}
                        </div>
                      </div>
                    ) : null}
                  </Panel>
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
