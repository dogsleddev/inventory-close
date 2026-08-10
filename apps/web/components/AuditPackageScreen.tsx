"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  AuditPackageData,
  PackageManifestData,
  ReplayResultView,
  ShellData,
} from "../lib/view-model";
import { AppShell } from "./AppShell";
import { EvidenceDrawerPanel } from "./EvidenceDrawerPanel";
import { ExceptionDrawer } from "./ExceptionDrawer";
import { PackageManifest } from "./PackageManifest";
import {
  AuditDetails,
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  ScopeNotice,
  StatusCapsule,
  TabBar,
} from "./kit";

/**
 * Audit Package — the management-prepared PBC workspace (stage 07).
 *
 * Two things the screen must never blur. **Ready is not accepted:** no state
 * in this product records an auditor's conclusion, and the ladder says so
 * rather than leaving it implied. **Provided is sealed:** a provided version
 * shows its hash and a SEALED lock, and the working draft is the only object
 * on the version tab that is editable.
 */
export function AuditPackageScreen({
  shell,
  data,
  manifest,
  reproduceAction,
  initialTab,
  setRoleAction,
}: {
  shell: ShellData;
  data: AuditPackageData;
  /** Package-level provenance; null when the role cannot read close data. */
  manifest: PackageManifestData | null;
  reproduceAction: () => Promise<ReplayResultView>;
  /** `?tab=` deep link into a workpaper tab; ignored when unknown. */
  initialTab?: string | undefined;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const tabKeys = data.detail?.tabs.map((t) => t.key) ?? [];
  const [tab, setTab] = useState(
    initialTab !== undefined && tabKeys.includes(initialTab) ? initialTab : "summary",
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
  const detail = data.detail;

  return (
    <AppShell
      shell={shell}
      section="Audit Package"
      setRoleAction={setRoleAction}
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
        "Which PBC items are not ready?",
        "What is PBC-008 waiting on?",
        "Where did this workpaper's numbers come from?",
      ]}
      askContext="FY2026 Inventory Close · Audit Package"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Audit Package</h1>
            <div className="icg-page-context">
              Management-prepared · FY2026 · balance-sheet date Dec. 31, 2026
            </div>
          </div>
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="the PBC package" />
            </div>
          </Panel>
        ) : (
          <>
            {data.auditorNote !== null ? (
              <Panel>
                <div style={{ padding: "12px 18px" }}>
                  <div className="icg-state" role="status">
                    <span className="icg-state-glyph" aria-hidden>
                      ◑
                    </span>
                    <div>
                      <div className="icg-state-title">Auditor view — read only</div>
                      <div className="icg-state-note">{data.auditorNote}</div>
                    </div>
                  </div>
                </div>
              </Panel>
            ) : null}

            {data.readiness !== null ? (
              <Panel decision>
                <div style={{ padding: "14px 18px 16px" }}>
                  <div className="icg-label icg-label--md">PBC READINESS</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "12px",
                      flexWrap: "wrap",
                      marginTop: "3px",
                    }}
                  >
                    <span
                      className="icg-num"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "34px",
                        fontWeight: 600,
                      }}
                    >
                      {data.readiness.pct}
                    </span>
                    <span className="icg-soft" style={{ fontSize: "13px" }}>
                      {data.readiness.summary}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginTop: "11px",
                    }}
                  >
                    {data.readiness.states.map((state) => (
                      <div
                        key={state.label}
                        className="icg-subpanel"
                        style={{ padding: "8px 12px", minWidth: "128px" }}
                      >
                        <div style={{ fontSize: "11px", color: "var(--soft)" }}>
                          <span aria-hidden style={{ marginRight: "5px", fontSize: "9px" }}>
                            {state.glyph}
                          </span>
                          {state.label}
                        </div>
                        <div
                          className="icg-num"
                          style={{ fontSize: "19px", fontWeight: 600, marginTop: "2px" }}
                        >
                          {state.count}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p
                    className="icg-quiet"
                    style={{ fontSize: "11px", lineHeight: 1.55, margin: "11px 0 0" }}
                  >
                    {data.readiness.note}
                  </p>
                </div>
              </Panel>
            ) : null}

            {data.attention !== null ? (
              <Panel>
                <PanelHead
                  title="Requires attention"
                  // Definitional, not historical: these are the requests
                  // outside the Ready/Provided numerator. PBC-008 HAS been
                  // provided and is owed a follow-up, so "not yet provided"
                  // would be false of it.
                  sub={`${data.attention.rows.length} requests are neither Ready nor Provided.`}
                  right={
                    <span className="icg-nstag">
                      {data.attention.rows.length} OF {data.rows.length}
                    </span>
                  }
                />
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Request</th>
                        <th scope="col">Waiting on</th>
                        <th scope="col">Owner</th>
                        <th scope="col">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.attention.rows.map((row) => (
                        <tr key={row.id} data-selected={row.selected}>
                          <td>
                            <Link className="icg-row-id icg-mono" href={`/audit-package?pbc=${row.id}`}>
                              {row.id}
                            </Link>
                          </td>
                          <td style={{ fontSize: "12px" }}>{row.title}</td>
                          <td className="icg-soft" style={{ fontSize: "11.5px" }}>
                            {row.blocker}
                          </td>
                          <td className="icg-soft" style={{ fontSize: "11.5px" }}>
                            {row.owner}
                          </td>
                          <td>
                            <StatusCapsule status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p
                  className="icg-quiet"
                  style={{ fontSize: "11px", lineHeight: 1.55, padding: "11px 18px 15px", margin: 0 }}
                >
                  {data.attention.note}
                </p>
              </Panel>
            ) : null}

            {detail !== null ? (
              <Panel>
                <PanelHead
                  title={`${detail.id} · ${detail.title}`}
                  sub={`Prepared by ${detail.owner}`}
                  right={<StatusCapsule status={detail.status} />}
                />
                <TabBar
                  tabs={detail.tabs}
                  active={tab}
                  onSelect={setTab}
                  label={`${detail.id} workpaper tabs`}
                  panelId="icg-pbc-panel"
                />
                <div
                  id="icg-pbc-panel"
                  role="tabpanel"
                  aria-labelledby={`icg-pbc-panel-tab-${tab}`}
                  style={{ padding: "14px 18px 16px" }}
                >
                  {tab === "summary" ? (
                    <dl style={{ margin: 0, display: "grid", gap: "8px" }}>
                      {detail.summary.map((row) => (
                        <div
                          key={row.k}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "180px 1fr",
                            gap: "12px",
                          }}
                        >
                          <dt className="icg-label">{row.k}</dt>
                          <dd style={{ margin: 0, fontSize: "12px" }}>{row.v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {tab === "workpaper" ? (
                    <div>
                      {/* A path truncated by scope says so instead of being
                          presented under a claim that it traces end to end. */}
                      {detail.workpaper.scopeNotice !== null ? (
                        <div style={{ marginBottom: "12px" }}>
                          <ScopeNotice text={detail.workpaper.scopeNotice} />
                        </div>
                      ) : (
                        <p className="icg-soft" style={{ fontSize: "11.5px", margin: "0 0 11px" }}>
                          {detail.workpaper.note}
                        </p>
                      )}
                      <div className="icg-lineage">
                        {detail.workpaper.lineage.map((node, i) => (
                          <div key={node.layer} style={{ display: "contents" }}>
                            <div
                              className={`icg-lineage-node${node.ember ? " icg-lineage-node--ember" : ""}`}
                            >
                              <div className="icg-label">{node.layer}</div>
                              <div
                                className="icg-mono"
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  marginTop: "3px",
                                  color: node.ember ? "var(--ember)" : undefined,
                                }}
                              >
                                {node.id}
                              </div>
                              {node.note !== "" ? (
                                <div className="icg-quiet" style={{ fontSize: "10.5px" }}>
                                  {node.note}
                                </div>
                              ) : null}
                            </div>
                            {i < detail.workpaper.lineage.length - 1 ? (
                              <span className="icg-lineage-arrow" aria-hidden>
                                →
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {detail.workpaper.terminates !== null ? (
                        <div
                          className="icg-subpanel"
                          style={{ padding: "11px 13px", marginTop: "12px" }}
                        >
                          <div className="icg-label">WHERE THE PATH ENDS</div>
                          <p
                            style={{
                              fontSize: "11.5px",
                              lineHeight: 1.55,
                              margin: "5px 0 0",
                              color: "var(--ember)",
                            }}
                          >
                            {detail.workpaper.terminates}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {tab === "evidence" ? (
                    <div>
                      {detail.evidence.scopeNotice !== null ? (
                        <ScopeNotice text={detail.evidence.scopeNotice} />
                      ) : detail.evidence.rows.length === 0 ? (
                        <NoRecordsState note="No evidence is linked to this workpaper's dependencies." />
                      ) : (
                        <div style={{ display: "grid", gap: "6px" }}>
                          {detail.evidence.rows.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              className="icg-subpanel"
                              onClick={() => {
                                setExceptionId(null);
                                setRecordId(row.recordId);
                              }}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "12px",
                                padding: "9px 12px",
                                textAlign: "left",
                                cursor: "pointer",
                                border: row.missing
                                  ? "1.5px dashed var(--ember)"
                                  : "1px solid var(--hair)",
                                background: row.missing ? "var(--ember-bg)" : undefined,
                              }}
                            >
                              <span style={{ display: "grid", gap: "2px" }}>
                                <span className="icg-label">{row.source}</span>
                                <span
                                  style={{
                                    fontSize: "12px",
                                    color: row.missing ? "var(--ember)" : undefined,
                                    fontWeight: row.missing ? 600 : 400,
                                  }}
                                >
                                  {row.kind}
                                </span>
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "9px",
                                  color: row.missing ? "var(--ember)" : "var(--soft)",
                                  fontSize: "10.5px",
                                }}
                              >
                                <span className="icg-mono" style={{ fontSize: "10.5px" }}>
                                  {row.id}
                                </span>
                                <span>
                                  <span aria-hidden style={{ marginRight: "4px" }}>
                                    {row.glyph}
                                  </span>
                                  {row.state}
                                  {row.missing ? (
                                    <span className="icg-sr-only"> — missing, required</span>
                                  ) : null}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p
                        className="icg-quiet"
                        style={{ fontSize: "10.5px", lineHeight: 1.5, margin: "11px 0 0" }}
                      >
                        {detail.evidence.note}
                      </p>
                    </div>
                  ) : null}

                  {tab === "versions" ? (
                    <div style={{ display: "grid", gap: "7px" }}>
                      {/* An empty list under a scope is not "no history". */}
                      {detail.versions.scopeNotice !== null ? (
                        <ScopeNotice text={detail.versions.scopeNotice} />
                      ) : null}
                      {detail.versions.rows.length === 0 &&
                      detail.versions.scopeNotice === null ? (
                        <NoRecordsState note="No version exists — preparation has not started." />
                      ) : null}
                      {detail.versions.rows.map((v) => (
                        <div
                          key={v.key}
                          className={`icg-version${v.sealed ? " icg-version--sealed" : " icg-version--draft"}`}
                        >
                          <div style={{ display: "grid", gap: "2px" }}>
                            <div style={{ fontSize: "12.5px", fontWeight: 600 }}>
                              <span aria-hidden style={{ marginRight: "6px", fontSize: "9px" }}>
                                {v.glyph}
                              </span>
                              {v.label}
                              <span className="icg-quiet" style={{ fontWeight: 400 }}>
                                {" · "}
                                {v.date}
                              </span>
                            </div>
                            <div className="icg-soft" style={{ fontSize: "11.5px" }}>
                              {v.note}
                            </div>
                            <div className="icg-quiet" style={{ fontSize: "10.5px" }}>
                              {v.by}
                              {v.hash !== null ? (
                                <span className="icg-mono">{` · ${v.hash}`}</span>
                              ) : null}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span className="icg-nstag">{v.state}</span>
                            <span className="icg-lock">{v.lock}</span>
                          </div>
                        </div>
                      ))}
                      <p
                        className="icg-quiet"
                        style={{ fontSize: "10.5px", lineHeight: 1.5, margin: "4px 0 0" }}
                      >
                        A provided version is sealed with its hash at the moment it was
                        provided and can only be superseded, never edited. The working draft
                        is the only editable object on this tab.
                      </p>
                    </div>
                  ) : null}

                  {tab === "related" ? (
                    <div style={{ display: "grid", gap: "7px" }}>
                      {detail.related.length === 0 ? (
                        <NoRecordsState note="No close exception is linked to this workpaper." />
                      ) : null}
                      {detail.related.map((rel) => (
                        <div
                          key={rel.id}
                          className="icg-subpanel"
                          style={{ padding: "10px 13px" }}
                        >
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
                              <Link
                                className="icg-row-id icg-mono"
                                href={`/exceptions/${rel.id}`}
                              >
                                {rel.id}
                              </Link>
                              <span style={{ fontSize: "12px" }}>{rel.title}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span className="icg-num" style={{ fontSize: "13px" }}>
                                {rel.exposure}
                              </span>
                              <StatusCapsule status={rel.status} />
                            </div>
                          </div>
                          {rel.drawerId !== null ? (
                            <button
                              type="button"
                              className="icg-linkbtn"
                              style={{ marginTop: "6px" }}
                              onClick={() => {
                                setRecordId(null);
                                setExceptionId(rel.drawerId);
                              }}
                            >
                              Open {rel.id} summary
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <p
                        className="icg-quiet"
                        style={{ fontSize: "10.5px", lineHeight: 1.5, margin: "4px 0 0" }}
                      >
                        Resolved exceptions stay linked. Their history travels with the
                        workpaper so a reviewer can see what was asked and how it was
                        concluded.
                      </p>
                    </div>
                  ) : null}

                  {tab === "audit" ? <AuditDetails rows={detail.audit} /> : null}
                </div>
              </Panel>
            ) : null}

            <Panel>
              <PanelHead
                title="All PBC requests"
                sub="Management preparation state. No row records what the audit team concluded."
              />
              <div className="icg-table-wrap">
                <table className="icg-table">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Request</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Versions</th>
                      <th scope="col">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id} data-selected={row.selected}>
                        <td>
                          <Link className="icg-row-id icg-mono" href={`/audit-package?pbc=${row.id}`}>
                            {row.id}
                          </Link>
                        </td>
                        <td style={{ fontSize: "12px" }}>
                          {row.title}
                          {row.blockedBy.length > 0 ? (
                            <span
                              className="icg-quiet"
                              style={{ display: "block", fontSize: "10.5px" }}
                            >
                              Waiting on {row.blockedBy.join(", ")}
                            </span>
                          ) : null}
                        </td>
                        <td className="icg-soft" style={{ fontSize: "11.5px" }}>
                          {row.owner}
                        </td>
                        <td className="icg-soft" style={{ fontSize: "11px" }}>
                          {row.versions}
                        </td>
                        <td>
                          <StatusCapsule status={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="What each state means" />
              <div style={{ padding: "0 18px 16px", display: "grid", gap: "7px" }}>
                {data.ladder.map((entry) => (
                  <div
                    key={entry.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "190px 1fr",
                      gap: "12px",
                      fontSize: "11.5px",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      <span aria-hidden style={{ marginRight: "6px", fontSize: "9px" }}>
                        {entry.glyph}
                      </span>
                      {entry.label}
                    </span>
                    <span className="icg-soft">{entry.meaning}</span>
                  </div>
                ))}
                <p
                  style={{
                    fontSize: "11.5px",
                    lineHeight: 1.55,
                    margin: "6px 0 0",
                    fontWeight: 500,
                  }}
                >
                  {data.acceptanceNote}
                </p>
              </div>
            </Panel>

            {manifest !== null ? (
              <PackageManifest data={manifest} reproduceAction={reproduceAction} />
            ) : null}
          </>
        )}
      </main>
    </AppShell>
  );
}
