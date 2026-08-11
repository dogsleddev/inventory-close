"use client";

import Link from "next/link";
import type { ExceptionDrawerData } from "../lib/view-model";
import { useDrawerFocus } from "../lib/use-drawer-focus";
import { RiskIndicator, SourceStateChip, StatusCapsule } from "./kit";

/**
 * Object drawer (design 01/02): exception summary with the split evidence
 * comparison. The ID link navigates to the full object; the drawer never
 * carries more than the summary.
 */
export function ExceptionDrawer({
  data,
  onClose,
}: {
  data: ExceptionDrawerData;
  onClose: () => void;
}) {
  const { rootRef, headingRef } = useDrawerFocus<HTMLElement>(onClose, data.id);

  return (
    <aside ref={rootRef} className="icg-drawer" aria-label={`${data.id} summary`}>
      <div className="icg-drawer-head">
        <div ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>
          <div className="icg-id">
            {data.id}
            {data.subtitle !== undefined ? ` · ${data.subtitle}` : ""}
          </div>
          <h2
            style={{
              fontSize: "13.5px",
              fontWeight: 600,
              lineHeight: 1.35,
              margin: "3px 0 0",
            }}
          >
            {data.title}
          </h2>
        </div>
        <button
          type="button"
          className="icg-drawer-close"
          aria-label="Close drawer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="icg-drawer-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          <StatusCapsule status={data.status} />
          <RiskIndicator risk={data.risk} outline />
          {data.blocker ? (
            <span
              className="icg-mono icg-soft"
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "4px",
                border: "1px solid var(--hair-2)",
              }}
            >
              BLOCKER
            </span>
          ) : null}
          <span
            className="icg-num"
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              background: "var(--panel-2)",
              fontWeight: 600,
            }}
          >
            {data.exposure}
          </span>
        </div>

        <div>
          <div className="icg-label icg-label--md" style={{ marginBottom: "6px" }}>
            SPLIT EVIDENCE COMPARISON
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              style={{
                border: "1px solid var(--hair)",
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              <div className="icg-label">NETSUITE SAYS</div>
              <div style={{ fontSize: "12px", marginTop: "3px" }}>{data.layers.netsuite}</div>
            </div>
            <div
              style={{
                border: "1px solid var(--hair)",
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              <div className="icg-label">PHYSICAL EVIDENCE SAYS</div>
              <div style={{ fontSize: "12px", marginTop: "3px" }}>{data.layers.physical}</div>
            </div>
            <div
              style={{
                border: data.layers.accountingMissing
                  ? "1px solid var(--ember-line)"
                  : "1px solid var(--hair)",
                background: data.layers.accountingMissing ? "var(--ember-bg)" : undefined,
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              <div
                className="icg-label"
                style={data.layers.accountingMissing ? { color: "var(--ember)" } : undefined}
              >
                ACCOUNTING EVIDENCE SAYS
              </div>
              <div
                style={{
                  fontSize: "12px",
                  marginTop: "3px",
                  color: data.layers.accountingMissing ? "var(--ember)" : undefined,
                }}
              >
                {data.layers.accounting}
              </div>
            </div>
          </div>
        </div>

        {data.sourceRecords.length > 0 ? (
          <div>
            <div className="icg-label icg-label--md" style={{ marginBottom: "6px" }}>
              SOURCE RECORDS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {/* §4 one destination per record: the chip goes to the full
                  exception, where the evidence record drawer lives. */}
              {data.sourceRecords.map((r) => (
                <Link key={r.id} href={`/exceptions/${data.id}`} className="icg-record-chip">
                  <span className="icg-record-chip-src">{r.source}</span>
                  <span className="icg-record-chip-div" aria-hidden />
                  <span className="icg-record-chip-kind">{r.kind}</span>
                  <span className="icg-record-chip-id">{r.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {data.coverageWarnings.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {data.coverageWarnings.map((w) => (
              <SourceStateChip key={w} text={w} />
            ))}
          </div>
        ) : null}

        <div style={{ borderTop: "1px solid var(--hair)", paddingTop: "12px" }}>
          <div className="icg-label icg-label--md">MANAGEMENT CONCLUSION</div>
          <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "4px" }}>
            {data.conclusion}
          </div>
          <div
            className="icg-soft"
            style={{ fontSize: "11.5px", marginTop: "2px", lineHeight: 1.5 }}
          >
            Next action: {data.nextAction}
          </div>
          <div style={{ display: "flex", gap: "7px", marginTop: "10px" }}>
            <Link
              href={`/exceptions/${data.id}`}
              className="icg-btn icg-btn--primary"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              Open full exception
            </Link>
            {/* The drawer carries the summary and nothing more: the verbs
                belong on the full exception, which is one click away above.
                A second inert copy of an action here only multiplied the
                places a reader could click and get nothing. */}
          </div>
        </div>
      </div>
    </aside>
  );
}
