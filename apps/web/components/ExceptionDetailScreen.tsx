"use client";

import { useState, type CSSProperties } from "react";
import type { ExceptionDetailData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { EvidenceDrawerPanel } from "./EvidenceDrawerPanel";
import {
  AuditDetails,
  Panel,
  PanelHead,
  RestrictedState,
  RiskIndicator,
  ScopeNotice,
  StatusCapsule,
} from "./kit";

/**
 * Standardized exception detail (design 03) — EXC-001 is the flagship.
 * Reading order without leaving the screen: status → three-layer reality →
 * transaction chain → why flagged → evidence state → timeline. Every chip,
 * chain node and timeline row opens the same evidence record drawer.
 */
export function ExceptionDetailScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: ExceptionDetailData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const record =
    evidenceId !== null ? data.evidenceRecords?.[evidenceId] : undefined;

  const openEvidence = (id: string | null) => {
    if (id !== null) setEvidenceId(id);
  };

  const shellProps = {
    shell,
    section: "Exceptions",
    setRoleAction,
    breadcrumb: {
      parentLabel: "Exceptions",
      parentHref: "/exceptions",
      current: data.id,
    },
    drawerOpen: record !== undefined,
    onCloseDrawer: () => setEvidenceId(null),
    drawer:
      record !== undefined ? (
        // Keyed per record: switching records remounts the panel so Audit
        // Details returns to collapsed, per §4 ("state is not remembered
        // between objects").
        <EvidenceDrawerPanel key={record.id} record={record} onClose={() => setEvidenceId(null)} />
      ) : undefined,
    askSuggestions: [
      "Why is this open?",
      "What evidence is missing?",
      "What does NetSuite say?",
      "Which assertions are affected?",
    ],
    askContext: `${data.id} · ${data.header?.primarySerial ?? ""}`.trim(),
  } as const;

  if (data.restricted || !data.found || data.header === undefined) {
    return (
      <AppShell {...shellProps}>
        <main className="icg-workspace">
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              {data.restricted ? (
                <RestrictedState roleLabel={data.roleLabel} what="exception detail" />
              ) : (
                <div className="icg-state" role="status">
                  <span className="icg-state-glyph" aria-hidden>
                    ○
                  </span>
                  <div>
                    <div className="icg-state-title">No such exception</div>
                    <div className="icg-state-note">
                      {data.id} is not in the FY2026 close population.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </main>
      </AppShell>
    );
  }

  const h = data.header;

  return (
    <AppShell
      {...shellProps}
      {...(data.blockerPosition !== null ? { headerNote: data.blockerPosition } : {})}
    >
      <main className="icg-workspace">
        {/* 1 · Header / status — the screen's one decision panel */}
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
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span className="icg-id" style={{ fontSize: "12px" }}>
                  {data.id}
                </span>
                <h1 className="icg-page-title" style={{ margin: 0 }}>
                  {h.title}
                </h1>
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}
              >
                <StatusCapsule status={h.status} />
                <RiskIndicator risk={h.risk} outline />
                {h.blocker ? (
                  <span
                    className="icg-mono"
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.06em",
                      padding: "3px 9px",
                      borderRadius: "4px",
                      border: "1px solid var(--hair-2)",
                      background: "var(--panel-3)",
                    }}
                  >
                    BLOCKER
                  </span>
                ) : null}
                <span
                  style={{
                    fontSize: "11px",
                    padding: "3px 9px",
                    borderRadius: "4px",
                    background: "var(--frost-bg)",
                    color: "var(--frost)",
                    fontWeight: 600,
                  }}
                >
                  Owner: {h.owner}
                </span>
                <span
                  className="icg-num"
                  style={{
                    fontSize: "11px",
                    padding: "3px 9px",
                    borderRadius: "4px",
                    background: "var(--panel-2)",
                    fontWeight: 600,
                  }}
                >
                  {h.exposureDetail}
                </span>
                {h.primarySerial !== null ? (
                  <span
                    className="icg-mono"
                    style={{
                      fontSize: "10.5px",
                      padding: "3px 9px",
                      borderRadius: "4px",
                      border: "1px solid var(--hair)",
                    }}
                  >
                    {h.primarySerial}
                  </span>
                ) : null}
              </div>
              <p
                className="icg-soft"
                style={{
                  fontSize: "12.5px",
                  lineHeight: 1.55,
                  margin: "9px 0 0",
                  maxWidth: "640px",
                }}
              >
                {h.description}
              </p>
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
              <div>
                <div className="icg-label icg-label--md">MANAGEMENT CONCLUSION</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "3px",
                  }}
                >
                  <span className="icg-soft" style={{ fontSize: "11px" }} aria-hidden>
                    {h.conclusion === "Open" ? "○" : "✓"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "22px",
                      fontWeight: 600,
                    }}
                  >
                    {h.conclusion}
                  </span>
                </div>
                <div className="icg-quiet" style={{ fontSize: "11px" }}>
                  {h.conclusionNote}
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--hair)", paddingTop: "8px" }}>
                <div className="icg-label icg-label--md">NEXT ACTION</div>
                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 500,
                    marginTop: "3px",
                    lineHeight: 1.4,
                  }}
                >
                  {h.nextAction}
                </div>
                <div className="icg-quiet" style={{ fontSize: "11px", marginTop: "2px" }}>
                  {h.nextActionParty}
                </div>
              </div>
              <div
                className="icg-action-conclude"
                style={{ display: "flex", gap: "7px", marginTop: "2px" }}
              >
                <button type="button" className="icg-btn icg-btn--primary">
                  Record conclusion
                </button>
                <button type="button" className="icg-btn icg-btn--ghost">
                  Request evidence
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* 2 · Three-layer reality */}
        {data.threeLayer !== undefined ? (
          <Panel>
            <div className="icg-three-layer">
              <div className="icg-layer">
                <div className="icg-label icg-label--md">NETSUITE SAYS</div>
                <div className="icg-layer-title">{data.threeLayer.netsuite.headline}</div>
                <div className="icg-soft" style={{ fontSize: "12px", marginTop: "2px" }}>
                  {data.threeLayer.netsuite.sub}
                </div>
                <div
                  style={{
                    marginTop: "9px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                  }}
                >
                  {data.threeLayer.netsuite.chips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`icg-record-chip${chip.netsuite ? " icg-record-chip--netsuite" : ""}`}
                      onClick={() => openEvidence(chip.evidenceId)}
                    >
                      <span className="icg-record-chip-src">{chip.src}</span>
                      <span className="icg-record-chip-div" aria-hidden />
                      <span className="icg-record-chip-kind">{chip.kind}</span>
                      <span className="icg-record-chip-id">{chip.id}</span>
                    </button>
                  ))}
                  <div className="icg-quiet" style={{ fontSize: "11px", lineHeight: 1.5 }}>
                    {data.threeLayer.netsuite.note}
                  </div>
                </div>
              </div>

              <div className="icg-layer">
                <div className="icg-label icg-label--md">PHYSICAL EVIDENCE SAYS</div>
                <div className="icg-layer-title">{data.threeLayer.physical.headline}</div>
                {data.threeLayer.physical.facts.length > 0 ? (
                  <div className="icg-layer-facts">
                    {data.threeLayer.physical.facts.map((f) => (
                      <div key={f.label}>
                        <div className="icg-label" style={{ color: "var(--quiet)" }}>
                          {f.label}
                        </div>
                        <div className="icg-layer-fact-value">{f.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "5px",
                    marginTop: "10px",
                  }}
                >
                  {data.threeLayer.physical.chips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="icg-chip-inline"
                      onClick={() => openEvidence(chip.evidenceId)}
                    >
                      {chip.src}
                      <span className="icg-chip-inline-div" aria-hidden />
                      <span className="icg-chip-inline-id">{chip.id}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`icg-layer${data.threeLayer.accounting.missing ? " icg-layer--conflict" : ""}`}
              >
                <div
                  className="icg-label icg-label--md"
                  style={
                    data.threeLayer.accounting.missing ? { color: "var(--ember)" } : undefined
                  }
                >
                  ACCOUNTING EVIDENCE SAYS
                </div>
                <div
                  className="icg-layer-title"
                  style={
                    data.threeLayer.accounting.missing ? { color: "var(--ember)" } : undefined
                  }
                >
                  {data.threeLayer.accounting.headline}
                </div>
                <div
                  className="icg-soft"
                  style={{ fontSize: "12px", marginTop: "2px", lineHeight: 1.5 }}
                >
                  {data.threeLayer.accounting.sub}
                </div>
                {data.threeLayer.accounting.missingChip !== null ? (
                  <div
                    style={{
                      marginTop: "9px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "5px",
                    }}
                  >
                    <button
                      type="button"
                      className="icg-record-chip icg-record-chip--missing"
                      onClick={() =>
                        openEvidence(data.threeLayer?.accounting.missingChip?.evidenceId ?? null)
                      }
                    >
                      <span className="icg-record-chip-src">
                        {data.threeLayer.accounting.missingChip.src}
                      </span>
                      <span className="icg-record-chip-div" aria-hidden />
                      <span className="icg-record-chip-kind">
                        {data.threeLayer.accounting.missingChip.label}
                      </span>
                      <span className="icg-record-chip-id">MISSING</span>
                    </button>
                    {data.threeLayer.accounting.staleNote !== null ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "10.5px",
                          color: "var(--warn)",
                        }}
                      >
                        <span aria-hidden style={{ fontSize: "8px" }}>
                          ◔
                        </span>
                        {data.threeLayer.accounting.staleNote}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {data.threeLayer.interpretation !== null ? (
              <div className="icg-interpretation">
                <span
                  className="icg-label icg-label--md"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {data.threeLayer.interpretation.label}
                </span>
                <span className="icg-interpretation-text">
                  {data.threeLayer.interpretation.text}
                </span>
              </div>
            ) : null}
          </Panel>
        ) : null}

        {/* 3 · Transaction chain */}
        {data.chain !== undefined && data.chain !== null ? (
          <Panel>
            <div style={{ padding: "14px 18px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                  gap: "12px",
                }}
              >
                <h2 className="icg-panel-title">Transaction chain</h2>
                {/* Quiet type beside the missing component — never a score,
                    ratio bar, or percentage (semantic distinction §6). */}
                <div className="icg-quiet" style={{ fontSize: "11px" }}>
                  {data.chain.summary}
                </div>
              </div>
              <div className="icg-chain">
                {data.chain.nodes.map((node, i) => (
                  <div
                    key={node.type + i}
                    className="icg-chain-seg"
                    style={{ flex: node.flex }}
                  >
                    <button
                      type="button"
                      className={`icg-chain-node${
                        node.visual === "missing"
                          ? " icg-chain-node--missing"
                          : node.visual === "conflict"
                            ? " icg-chain-node--conflict"
                            : ""
                      }`}
                      onClick={() => openEvidence(node.evidenceId)}
                    >
                      <span className="icg-chain-node-type">{node.type}</span>
                      <span className="icg-chain-node-value">{node.value}</span>
                      <span className="icg-chain-node-state">
                        <span aria-hidden style={{ fontSize: "8px" }}>
                          {node.glyph}
                        </span>
                        {node.state}
                      </span>
                    </button>
                    {i < (data.chain?.nodes.length ?? 0) - 1 ? (
                      <span className="icg-chain-connector" aria-hidden>
                        –
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        ) : null}

        {/* 4 · Why flagged */}
        {data.whyFlagged !== undefined ? (
          <Panel>
            <div
              style={{
                padding: "14px 18px",
                display: "grid",
                gridTemplateColumns: record !== undefined ? "1fr" : "1fr 340px",
                gap: "20px",
              }}
            >
              <div>
                <h2 className="icg-panel-title">Why this was flagged</h2>
                <p
                  className="icg-soft"
                  style={{ fontSize: "12.5px", lineHeight: 1.6, margin: "5px 0 0" }}
                >
                  {data.whyFlagged.text}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginTop: "10px",
                  }}
                >
                  {data.whyFlagged.assertions.map((a) => (
                    <span key={a} className="icg-assertion">
                      ASSERTION · {a.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
              <div
                style={{
                  borderLeft: record !== undefined ? undefined : "1px solid var(--hair)",
                  paddingLeft: record !== undefined ? 0 : "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div className="icg-kv" style={{ fontSize: "11.5px" }}>
                  <span className="icg-kv-key">Rule</span>
                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                    {data.whyFlagged.ruleId} · v{data.whyFlagged.ruleVersion}
                  </span>
                </div>
                <div className="icg-kv" style={{ fontSize: "11.5px" }}>
                  <span className="icg-kv-key">Result</span>
                  <span
                    className="icg-mono"
                    style={{ fontSize: "11px", color: "var(--warn)" }}
                  >
                    {data.whyFlagged.result}
                  </span>
                </div>
                <div className="icg-kv" style={{ fontSize: "11.5px" }}>
                  <span className="icg-kv-key">Coverage</span>
                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                    {data.whyFlagged.coverage}
                  </span>
                </div>
                <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5 }}>
                  Missing required evidence never resolves to PASS.
                </div>
                <div
                  style={{ borderTop: "1px solid var(--hair)", paddingTop: "8px", marginTop: "2px" }}
                >
                  <AuditDetails rows={data.whyFlagged.audit} hint="rule execution & run" />
                </div>
              </div>
            </div>
          </Panel>
        ) : null}

        {/* 5 · Evidence state + timeline */}
        <div
          className="icg-split"
          style={
            {
              "--icg-split-cols": record !== undefined ? "1fr" : "1.45fr 1fr",
            } as CSSProperties
          }
        >
          {data.evidenceState !== undefined ? (
            <Panel>
              <PanelHead
                title="Evidence state"
                right={
                  <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                    Known · Conflicting · Missing
                  </span>
                }
              />
              <div
                style={{
                  padding: "12px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "11px",
                }}
              >
                {data.evidenceState.scopeNotice !== null ? (
                  <ScopeNotice text={data.evidenceState.scopeNotice} />
                ) : null}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      marginBottom: "6px",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: "9px", color: "var(--aurora)" }}>
                      ✓
                    </span>
                    <span className="icg-label icg-label--md">
                      KNOWN · {data.evidenceState.known.length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {data.evidenceState.known.map((k) => (
                      <button
                        key={k.evidenceId}
                        type="button"
                        className="icg-evchip"
                        onClick={() => openEvidence(k.evidenceId)}
                      >
                        <span className="icg-evchip-glyph icg-evchip-glyph--known" aria-hidden>
                          ✓
                        </span>
                        {k.label}
                        <span className="icg-evchip-src">{k.src}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--hair)", paddingTop: "10px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      marginBottom: "6px",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: "9px", color: "var(--ember)" }}>
                      ✕
                    </span>
                    <span
                      className="icg-label icg-label--md"
                      style={{ color: "var(--ember)" }}
                    >
                      CONFLICTING · {data.evidenceState.conflicting.length}
                    </span>
                  </div>
                  {data.evidenceState.conflicting.map((c) => (
                    <div
                      key={c.title}
                      style={{
                        border: "1px solid var(--ember-line)",
                        background: "var(--ember-bg)",
                        borderRadius: "6px",
                        padding: "9px 11px",
                        marginBottom: "5px",
                      }}
                    >
                      <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{c.title}</div>
                      <div className="icg-soft" style={{ fontSize: "11px", marginTop: "2px" }}>
                        {c.detail}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid var(--hair)", paddingTop: "10px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      marginBottom: "6px",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: "9px", color: "var(--ember)" }}>
                      ○
                    </span>
                    <span
                      className="icg-label icg-label--md"
                      style={{ color: "var(--ember)" }}
                    >
                      MISSING · {data.evidenceState.missing.length}
                      {data.evidenceState.missing.length > 0 ? " — REQUIRED" : ""}
                    </span>
                  </div>
                  {data.evidenceState.missing.map((m) => (
                    <button
                      key={m.title}
                      type="button"
                      onClick={() => openEvidence(m.evidenceId)}
                      style={{
                        border: "1.5px dashed var(--ember)",
                        background: "transparent",
                        borderRadius: "6px",
                        padding: "11px 13px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                        marginBottom: "5px",
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        <span
                          style={{
                            display: "block",
                            fontFamily: "var(--font-display)",
                            fontSize: "15px",
                            fontWeight: 600,
                            color: "var(--ember)",
                          }}
                        >
                          {m.title}
                        </span>
                        <span
                          className="icg-soft"
                          style={{ display: "block", fontSize: "11.5px", marginTop: "2px" }}
                        >
                          {m.detail}
                        </span>
                      </span>
                      <span
                        className="icg-mono"
                        style={{ fontSize: "10px", color: "var(--ember)", whiteSpace: "nowrap" }}
                      >
                        OPEN REQUEST ↗
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          ) : null}

          {data.timeline !== undefined ? (
            <Panel>
              <PanelHead title="Evidence timeline" />
              <div style={{ padding: "12px 16px" }}>
                {data.timeline.scopeNotice !== null ? (
                  <ScopeNotice text={data.timeline.scopeNotice} />
                ) : null}
                {data.timeline.entries.map((t, i) => (
                  <button
                    key={t.label + i}
                    type="button"
                    className="icg-timeline-row"
                    onClick={() => openEvidence(t.evidenceId)}
                  >
                    <span
                      className="icg-timeline-date"
                      style={t.tone === "ember" ? { color: "var(--ember)" } : undefined}
                    >
                      {t.date}
                    </span>
                    <span className="icg-timeline-spine">
                      <span
                        className="icg-timeline-glyph"
                        aria-hidden
                        style={{
                          color:
                            t.tone === "ember"
                              ? "var(--ember)"
                              : t.tone === "soft"
                                ? "var(--soft)"
                                : "var(--ink)",
                        }}
                      >
                        {t.glyph}
                      </span>
                      <span className="icg-timeline-line" aria-hidden />
                    </span>
                    <span className="icg-timeline-body">
                      <span
                        className="icg-timeline-label"
                        style={{
                          display: "block",
                          fontWeight: t.emphasis ? 600 : 500,
                          color:
                            t.tone === "ember"
                              ? "var(--ember)"
                              : t.tone === "soft"
                                ? "var(--soft)"
                                : undefined,
                        }}
                      >
                        {t.label}
                      </span>
                      <span className="icg-timeline-src" style={{ display: "block" }}>
                        {t.src}
                      </span>
                    </span>
                  </button>
                ))}
                {data.timeline.missingBlocks.map((m) => (
                  <div key={m.label} className="icg-timeline-missing">
                    <button
                      type="button"
                      className="icg-timeline-row"
                      onClick={() => openEvidence(m.evidenceId)}
                    >
                      <span className="icg-timeline-date" style={{ color: "var(--ember)" }}>
                        —
                      </span>
                      <span className="icg-timeline-spine">
                        <span
                          className="icg-timeline-glyph"
                          aria-hidden
                          style={{ color: "var(--ember)" }}
                        >
                          ○
                        </span>
                      </span>
                      <span className="icg-timeline-body">
                        <span
                          className="icg-timeline-label"
                          style={{ display: "block", fontWeight: 600, color: "var(--ember)" }}
                          aria-label={`${m.label}, required`}
                        >
                          {m.label}
                        </span>
                        <span
                          className="icg-soft"
                          style={{ display: "block", fontSize: "10.5px", lineHeight: 1.45 }}
                        >
                          {m.detail}
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
