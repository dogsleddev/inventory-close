"use client";

import Link from "next/link";
import { useState } from "react";
import type { EvidenceCenterData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { EvidenceDrawerPanel } from "./EvidenceDrawerPanel";
import {
  ExportCsvLink,
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  ScopeNotice,
} from "./kit";

/**
 * Evidence Center (completion Stage A).
 *
 * The index of the evidence graph itself: every record the close reads, the
 * source that produced it, and how it bears on the exception it touches —
 * supports, corroborates, conflicts with, or is required for.
 *
 * Two sections that must never merge: records that EXIST (the table) and
 * requirements with NO record behind them (the gaps below it). A missing
 * record is not a row with blanks in it; it is the absence of a row, said
 * out loud.
 */
export function EvidenceScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: EvidenceCenterData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [recordId, setRecordId] = useState<string | null>(data.selectedId);
  const record = recordId !== null ? data.records[recordId] : undefined;

  return (
    <AppShell
      shell={shell}
      section="Evidence"
      setRoleAction={setRoleAction}
      drawerOpen={record !== undefined}
      onCloseDrawer={() => setRecordId(null)}
      drawer={
        record !== undefined ? (
          <EvidenceDrawerPanel record={record} onClose={() => setRecordId(null)} />
        ) : undefined
      }
      askSuggestions={[
        "Which evidence is still missing?",
        "Which sources are not healthy?",
        "What supports EXC-001?",
      ]}
      askContext="FY2026 Inventory Close · Evidence"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Evidence</h1>
            <div className="icg-page-context">
              Every record the close reads, the source that produced it, and what it bears on
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="evidence"
              label="the evidence index"
              // The gap list is the half of this screen a reader most needs
              // and the file does not carry. Saying so stops the file being
              // read as "the close is waiting on nothing".
              scopeNote="Records on file only — not the missing-record list or source health."
            />
          )}
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="the evidence index" />
            </div>
          </Panel>
        ) : (
          <>
            {data.scopeNotice !== null ? (
              <Panel>
                <div style={{ padding: "12px 18px" }}>
                  <ScopeNotice text={data.scopeNotice} />
                </div>
              </Panel>
            ) : null}

            <Panel>
              <PanelHead
                large
                title="Evidence index"
                sub="A record is listed once. Opening it anywhere in the product opens this same record."
                right={
                  <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                    {data.counts.total} records ·{" "}
                    {data.counts.withheld > 0
                      ? `${data.counts.withheld} withheld for your role`
                      : "none withheld for your role"}
                  </span>
                }
              />
              {data.rows.length === 0 ? (
                <div style={{ padding: "14px 18px" }}>
                  <NoRecordsState note="No evidence records are in scope for your role — verified empty, not assumed." />
                </div>
              ) : (
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">Record</th>
                        <th scope="col">Type</th>
                        <th scope="col">Source</th>
                        <th scope="col">Bears on</th>
                        <th scope="col">Retrieved</th>
                        <th scope="col">Content</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {/* The whole row opens the record; the id cell is
                                the accessible control that does it. */}
                            <button
                              type="button"
                              className="icg-row-btn icg-row-id"
                              onClick={() => setRecordId(row.id)}
                            >
                              {row.title}
                            </button>
                            <div
                              className="icg-mono icg-quiet"
                              style={{ fontSize: "9.5px", marginTop: "1px" }}
                            >
                              {row.id} · sha256:{row.hash}
                            </div>
                          </td>
                          <td style={{ fontSize: "11.5px" }}>{row.kind}</td>
                          <td>
                            <span className="icg-mono" style={{ fontSize: "10.5px" }}>
                              {row.src}
                            </span>
                            {row.internalId !== null ? (
                              <div
                                className="icg-mono icg-quiet"
                                style={{ fontSize: "9.5px" }}
                              >
                                {row.internalId}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {row.relations.length === 0 ? (
                                <span className="icg-quiet" style={{ fontSize: "11px" }}>
                                  —
                                </span>
                              ) : (
                                row.relations.map((rel) => (
                                  <Link
                                    key={`${rel.exceptionId}-${rel.linkType}`}
                                    href={`/exceptions/${rel.exceptionId}`}
                                    className="icg-chip-inline"
                                    style={
                                      rel.conflict ? { color: "var(--ember)" } : undefined
                                    }
                                  >
                                    {rel.label}
                                    <span className="icg-chip-inline-div" aria-hidden />
                                    <span className="icg-chip-inline-id">{rel.exceptionId}</span>
                                  </Link>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="icg-mono" style={{ fontSize: "10px" }}>
                            {row.retrieved}
                          </td>
                          <td style={{ fontSize: "11px" }}>
                            {row.withheld ? (
                              <span style={{ color: "var(--warn)" }}>
                                <span aria-hidden style={{ marginRight: "4px" }}>
                                  ◐
                                </span>
                                Withheld — {row.sensitivity.toLowerCase()}
                              </span>
                            ) : (
                              <span className="icg-quiet">Readable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHead
                title="Required, with no record behind it"
                sub="Open exceptions only — a resolved item's requirement is answered by management's conclusion, not by a record that never came. These are not rows above with blanks in them; nothing arrived, so nothing is listed there."
                right={
                  <span
                    className="icg-quiet"
                    style={{ fontSize: "10.5px", color: "var(--ember)" }}
                  >
                    {data.counts.missing} required
                  </span>
                }
              />
              {data.links.length === 0 ? (
                <div style={{ padding: "14px 18px" }}>
                  <NoRecordsState note="Every required record for the exceptions in your scope is in evidence." />
                </div>
              ) : (
                <div className="icg-table-wrap">
                  <table className="icg-table">
                    <thead>
                      <tr>
                        <th scope="col">Required record</th>
                        <th scope="col">Required for</th>
                        <th scope="col">Rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.links.map((gap) => (
                        <tr key={`${gap.exceptionId}-${gap.description}`}>
                          <td style={{ fontSize: "12px", color: "var(--ember)" }}>
                            <span aria-hidden style={{ marginRight: "6px" }}>
                              ○
                            </span>
                            {gap.description}
                            <span className="icg-sr-only"> — missing, required</span>
                          </td>
                          <td>
                            <Link
                              href={`/exceptions/${gap.exceptionId}`}
                              className="icg-row-link icg-row-id"
                            >
                              {gap.exceptionId}
                            </Link>
                          </td>
                          <td className="icg-mono" style={{ fontSize: "10.5px" }}>
                            {gap.ruleId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHead
                title="Source health"
                sub="What each system was able to tell the close, and when it last answered."
                right={
                  data.sourceHealth !== null ? (
                    <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                      {data.sourceHealth.score} ·{" "}
                      {data.sourceHealth.degraded === 0
                        ? "all sources healthy"
                        : `${data.sourceHealth.degraded} degraded`}
                    </span>
                  ) : undefined
                }
              />
              <div className="icg-table-wrap">
                <table className="icg-table">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">State</th>
                      <th scope="col">Last sync</th>
                      <th scope="col">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((s) => (
                      <tr key={s.key}>
                        <td style={{ fontSize: "12px" }}>{s.name}</td>
                        <td>
                          {/* Glyph plus label, never colour alone. */}
                          <span
                            className="icg-mono"
                            style={{
                              fontSize: "10px",
                              letterSpacing: "0.06em",
                              color: s.tone === "healthy" ? "var(--aurora)" : "var(--warn)",
                            }}
                          >
                            <span aria-hidden style={{ marginRight: "5px" }}>
                              {s.glyph}
                            </span>
                            {s.status}
                          </span>
                        </td>
                        <td className="icg-mono" style={{ fontSize: "10px" }}>
                          {s.lastSync}
                        </td>
                        <td className="icg-soft" style={{ fontSize: "11px" }}>
                          {s.note ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="icg-quiet"
                style={{ padding: "10px 18px 14px", fontSize: "10.5px", lineHeight: 1.5 }}
              >
                A degraded source does not change a control result on its own. Where it limits
                what a rule could read, the exception says so on its own screen.
              </div>
            </Panel>
          </>
        )}
      </main>
    </AppShell>
  );
}
