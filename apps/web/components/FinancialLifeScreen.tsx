"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { FinancialLifeData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { EvidenceDrawerPanel } from "./EvidenceDrawerPanel";
import {
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  StatusCapsule,
} from "./kit";

/**
 * Financial Life of the Unit (design 04) — one serial, four phases, five
 * relationship types. Every card and chain row opens the same record
 * drawer; a step with no record renders as an absence, never inferred.
 */
export function FinancialLifeScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: FinancialLifeData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [recordId, setRecordId] = useState<string | null>(null);
  const record = recordId !== null ? data.records[recordId] : undefined;
  const openRecord = (id: string | null) => {
    if (id !== null && data.records[id] !== undefined) setRecordId(id);
  };

  const shellProps = {
    shell,
    section: "Inventory",
    setRoleAction,
    breadcrumb: {
      parentLabel: "Inventory",
      parentHref: "/inventory",
      current: `Financial Life · ${data.serial}`,
    },
    drawerOpen: record !== undefined,
    onCloseDrawer: () => setRecordId(null),
    drawer:
      record !== undefined ? (
        // Keyed per record: switching remounts, so Audit Details resets (§4).
        <EvidenceDrawerPanel key={record.id} record={record} onClose={() => setRecordId(null)} />
      ) : undefined,
    askSuggestions: [
      "Walk me through this unit's financial life.",
      "When was this serial last counted?",
      "What conflicts at year-end?",
      "Which evidence is missing?",
    ],
    askContext: `${data.serial} · Financial Life`,
  } as const;

  if (data.restricted || !data.found) {
    return (
      <AppShell {...shellProps}>
        <main className="icg-workspace">
          <SerialSearchBar initial={data.serial} />
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              {data.restricted ? (
                <RestrictedState roleLabel={data.roleLabel} what="unit financial life" />
              ) : (
                <NoRecordsState
                  note={`No source in the dataset references ${data.serial} — verified empty, not assumed.`}
                />
              )}
            </div>
          </Panel>
        </main>
      </AppShell>
    );
  }

  const h = data.header;

  return (
    <AppShell {...shellProps}>
      <main className="icg-workspace">
        <SerialSearchBar initial={data.serial} />

        {/* 1 · Unit header */}
        {h !== undefined ? (
          <Panel decision>
            <div
              style={{
                padding: "14px 18px",
                display: "grid",
                gridTemplateColumns: record !== undefined ? "1fr" : "1fr 300px",
                gap: "20px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                  <h1
                    className="icg-page-title icg-mono"
                    style={{ margin: 0, fontFamily: "var(--font-display)" }}
                  >
                    {data.serial}
                  </h1>
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
                    SKU {h.sku}
                  </span>
                  <span className="icg-soft" style={{ fontSize: "12px" }}>
                    {h.skuNote}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "14px",
                    marginTop: "13px",
                  }}
                >
                  <div>
                    <div className="icg-label">UNIT CARRYING VALUE</div>
                    <div className="icg-num" style={{ fontSize: "15px", fontWeight: 600, marginTop: "3px" }}>
                      {h.carrying ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="icg-label">PERIOD-END STATE · NETSUITE</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "3px" }}>
                      {h.netsuite.headline}
                    </div>
                    <div className="icg-quiet" style={{ fontSize: "10.5px" }}>
                      {h.netsuite.sub}
                    </div>
                  </div>
                  <div>
                    <div className="icg-label">PHYSICAL STATE · EVIDENCE</div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        marginTop: "3px",
                        color: h.physical.ember ? "var(--ember)" : undefined,
                      }}
                    >
                      {h.physical.headline}
                    </div>
                    <div className="icg-quiet" style={{ fontSize: "10.5px" }}>
                      {h.physical.sub}
                    </div>
                  </div>
                  <div>
                    <div className="icg-label">
                      {h.exception !== null ? "OPEN EXCEPTION" : "EXCEPTIONS"}
                    </div>
                    {h.exception !== null ? (
                      <>
                        <Link
                          href={`/exceptions/${h.exception.id}`}
                          className="icg-mono"
                          style={{ fontSize: "13px", fontWeight: 600, marginTop: "3px", display: "inline-block" }}
                        >
                          {h.exception.id} ↗
                        </Link>
                        <div className="icg-quiet icg-num" style={{ fontSize: "10.5px" }}>
                          {h.exception.note}
                        </div>
                      </>
                    ) : (
                      <div className="icg-quiet" style={{ fontSize: "11px", marginTop: "3px" }}>
                        None reference this serial
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "12px" }}>
                  {h.chips.map((chip) =>
                    chip.href !== null ? (
                      <Link
                        key={chip.label}
                        href={chip.href}
                        className="icg-chip-inline"
                        style={{ textDecoration: "none" }}
                      >
                        <span className="icg-chip-inline-id">{chip.label}</span>
                      </Link>
                    ) : (
                      <button
                        key={chip.label}
                        type="button"
                        className="icg-chip-inline"
                        onClick={() => openRecord(chip.recordId)}
                      >
                        <span className="icg-chip-inline-id">{chip.label}</span>
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div
                style={{
                  borderLeft: record !== undefined ? undefined : "1px solid var(--hair)",
                  paddingLeft: record !== undefined ? 0 : "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div className="icg-label icg-label--md">CLOSE STATUS</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {h.close.status !== null ? (
                    <StatusCapsule status={h.close.status} />
                  ) : (
                    <span className="icg-soft" style={{ fontSize: "12px" }}>
                      No open exception
                    </span>
                  )}
                  {h.close.blocker ? (
                    <span
                      className="icg-mono"
                      style={{
                        fontSize: "10px",
                        letterSpacing: "0.06em",
                        padding: "3px 9px",
                        borderRadius: "4px",
                        border: "1px solid var(--hair-2)",
                      }}
                    >
                      BLOCKER
                    </span>
                  ) : null}
                </div>
                <p className="icg-soft" style={{ fontSize: "12px", lineHeight: 1.55, margin: 0 }}>
                  {h.close.body}
                </p>
              </div>
            </div>
          </Panel>
        ) : null}

        {/* 2 · Four-phase chain of custody */}
        {data.phases.length > 0 ? (
          <Panel>
            <PanelHead
              large
              title="Financial life"
              {...(data.range !== null ? { sub: data.range } : {})}
              right={
                <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                  Every card opens its source record
                </span>
              }
            />
            <div
              className="icg-phases"
              style={
                data.phases.length < 4
                  ? ({ gridTemplateColumns: `repeat(${data.phases.length}, 1fr)` } as CSSProperties)
                  : undefined
              }
            >
              {data.phases.map((phase) => (
                <div key={phase.name} className={phase.accent ? "icg-phase--accent" : undefined}>
                  <div className="icg-phase-head">
                    <span className="icg-label icg-label--md">{phase.name}</span>
                    <span className="icg-event-date">{phase.range}</span>
                  </div>
                  {phase.events.map((e) =>
                    e.href !== null ? (
                      <Link
                        key={e.key}
                        href={e.href}
                        className={`icg-event icg-event--${e.visual}`}
                        style={{ textDecoration: "none", display: "block" }}
                      >
                        <EventCardBody e={e} />
                      </Link>
                    ) : (
                      <button
                        key={e.key}
                        type="button"
                        className={`icg-event icg-event--${e.visual}`}
                        onClick={() => openRecord(e.recordId)}
                        disabled={e.recordId === null}
                        style={e.recordId === null ? { cursor: "default" } : undefined}
                      >
                        <EventCardBody e={e} />
                      </button>
                    ),
                  )}
                </div>
              ))}
            </div>
            <div className="icg-legend">
              <span className="icg-label icg-label--md">RELATIONSHIP</span>
              <span className="icg-legend-item">
                <span className="icg-legend-swatch" aria-hidden /> Accounting transaction
              </span>
              <span className="icg-legend-item">
                <span className="icg-legend-swatch icg-legend-swatch--phy" aria-hidden /> Physical
                event
              </span>
              <span className="icg-legend-item">
                <span className="icg-legend-swatch icg-legend-swatch--cor" aria-hidden />{" "}
                Corroborating evidence
              </span>
              <span className="icg-legend-item" style={{ color: "var(--ember)" }}>
                <span className="icg-legend-swatch icg-legend-swatch--miss" aria-hidden /> Required
                evidence — missing
              </span>
              <span className="icg-legend-item">
                <span className="icg-legend-swatch icg-legend-swatch--conc" aria-hidden />{" "}
                Management conclusion
              </span>
            </div>
          </Panel>
        ) : null}

        {/* 3 · Count history + evidence chain + accounting position */}
        <div
          className="icg-split"
          style={{ "--icg-split-cols": record !== undefined ? "1fr" : "1.5fr 1fr" } as CSSProperties}
        >
          {data.cycle !== null ? (
            <Panel>
              <PanelHead
                title="Count history"
                sub="Sourced from NetSuite inventory-count records"
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
              {data.cycle.empty !== null ? (
                <div style={{ padding: "14px 18px" }}>
                  <NoRecordsState note={data.cycle.empty} />
                </div>
              ) : (
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">Count date</th>
                        <th scope="col">Plan</th>
                        <th scope="col" className="icg-cell-right">
                          Snapshot
                        </th>
                        <th scope="col" className="icg-cell-right">
                          Counted
                        </th>
                        <th scope="col" className="icg-cell-right">
                          Variance
                        </th>
                        <th scope="col">Approval</th>
                        <th scope="col">Adjustment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cycle.rows.map((row) => (
                        <tr key={row.plan + row.date}>
                          <td className="icg-num">{row.date}</td>
                          <td>
                            <span className="icg-mono icg-soft" style={{ fontSize: "10px" }}>
                              {row.plan}
                            </span>
                          </td>
                          <td className="icg-cell-money">{row.snapshot}</td>
                          <td className="icg-cell-money">{row.counted}</td>
                          <td
                            className="icg-cell-money"
                            style={row.varianceWarn ? { color: "var(--ember)", fontWeight: 600 } : undefined}
                          >
                            {row.variance}
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: "11px",
                                color:
                                  row.approval.tone === "aurora"
                                    ? "var(--aurora)"
                                    : row.approval.tone === "ember"
                                      ? "var(--ember)"
                                      : "var(--soft)",
                              }}
                            >
                              <span aria-hidden style={{ fontSize: "9px", marginRight: "4px" }}>
                                {row.approval.glyph}
                              </span>
                              {row.approval.label}
                            </span>
                          </td>
                          <td>
                            <span className="icg-mono icg-soft" style={{ fontSize: "10px" }}>
                              {row.adjustment}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="icg-panel-foot">
                {data.cycle.notes.map((note) => (
                  <span key={note} className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.5 }}>
                    <span aria-hidden style={{ marginRight: "6px" }}>
                      ◆
                    </span>
                    {note}
                  </span>
                ))}
              </div>
            </Panel>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {data.evidenceChain.length > 0 ? (
              <Panel>
                <PanelHead
                  title="Evidence chain"
                  right={
                    <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                      required · corroborating
                    </span>
                  }
                />
                <div style={{ padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                  {data.evidenceChain.map((row) => (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() => openRecord(row.recordId)}
                      disabled={row.recordId === null}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        border:
                          row.visual === "missing"
                            ? "1.5px dashed var(--ember)"
                            : row.visual === "conflict"
                              ? "1px solid var(--ember-line)"
                              : "1px solid var(--hair)",
                        background:
                          row.visual === "missing" || row.visual === "conflict"
                            ? "var(--ember-bg)"
                            : "transparent",
                        color:
                          row.visual === "missing" || row.visual === "conflict"
                            ? "var(--ember)"
                            : "var(--ink)",
                        fontWeight: row.visual === "missing" ? 700 : 500,
                        borderRadius: "5px",
                        padding: "8px 11px",
                        fontSize: "12px",
                        cursor: row.recordId !== null ? "pointer" : "default",
                        textAlign: "left",
                      }}
                    >
                      <span aria-hidden style={{ fontSize: "9px" }}>
                        {row.glyph}
                      </span>
                      <span style={{ flex: 1 }}>{row.label}</span>
                      <span className="icg-mono" style={{ fontSize: "9px", letterSpacing: "0.05em" }}>
                        {row.tag}
                      </span>
                    </button>
                  ))}
                  {data.chainFootnote !== null ? (
                    <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5, marginTop: "4px" }}>
                      {data.chainFootnote}
                    </div>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            {data.accounting !== null ? (
              <Panel>
                <PanelHead title="Accounting position" />
                <div style={{ padding: "10px 16px 14px" }}>
                  <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
                    {data.accounting.rows.map((row) => (
                      <div
                        key={row.k}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          fontSize: "11.5px",
                          padding: "4px 0",
                          borderBottom: "1px solid var(--hair)",
                        }}
                      >
                        <dt className="icg-soft">{row.k}</dt>
                        <dd
                          className={row.mono === true ? "icg-mono" : "icg-num"}
                          style={{ margin: 0, fontWeight: 600 }}
                        >
                          {row.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div
                    style={{
                      border: "1.5px dashed var(--hair-2)",
                      borderRadius: "5px",
                      padding: "8px 11px",
                      marginTop: "9px",
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11.5px",
                    }}
                  >
                    <span className="icg-soft">Proposed adjustment for this unit</span>
                    <span style={{ fontWeight: 700 }}>{data.accounting.proposed}</span>
                  </div>
                  <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5, marginTop: "8px" }}>
                    {data.accounting.footnote}
                  </div>
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function EventCardBody({
  e,
}: {
  e: FinancialLifeData["phases"][number]["events"][number];
}) {
  return (
    <>
      <span className="icg-event-top">
        <span className="icg-event-kind">
          <span aria-hidden style={{ fontSize: "8px", marginRight: "4px" }}>
            {e.glyph}
          </span>
          {e.kind}
        </span>
        <span className="icg-event-date">{e.date}</span>
      </span>
      <span className="icg-event-title" style={{ display: "block" }}>
        {e.title}
      </span>
      {e.meta !== null ? (
        <span className="icg-event-meta" style={{ display: "block" }}>
          {e.meta}
        </span>
      ) : null}
    </>
  );
}

/** Serial search that reaches Financial Life in one click (docs/11). */
export function SerialSearchBar({ initial }: { initial?: string }) {
  return (
    <form action="/inventory" method="get" className="icg-lookup" style={{ alignSelf: "flex-start" }}>
      <span aria-hidden style={{ fontSize: "12px", color: "var(--quiet)" }}>
        ⌕
      </span>
      <input
        type="text"
        name="q"
        defaultValue={initial ?? ""}
        aria-label="Serial search"
        placeholder="Search a serial…"
        autoComplete="off"
        spellCheck={false}
      />
      <span className="icg-lookup-hint">SERIAL SEARCH</span>
    </form>
  );
}
