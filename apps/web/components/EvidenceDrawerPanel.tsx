"use client";

import type { EvidenceRecordView } from "../lib/view-model";
import { useDrawerFocus } from "../lib/use-drawer-focus";
import { AuditDetails } from "./kit";

/**
 * Evidence record drawer (design 03): one destination per record from any
 * chip, chain node, or timeline row. Separates occurred from retrieved and
 * original from normalized; a missing record renders as an absence with its
 * request state — never as an empty form.
 */
export function EvidenceDrawerPanel({
  record,
  onClose,
}: {
  record: EvidenceRecordView;
  onClose: () => void;
}) {
  const { rootRef, headingRef } = useDrawerFocus<HTMLElement>(onClose, record.id);

  const stateColors: Record<EvidenceRecordView["stateVariant"], { bg: string; fg: string }> = {
    resolved: { bg: "var(--aurora-bg)", fg: "var(--aurora)" },
    review: { bg: "var(--frost-bg)", fg: "var(--frost)" },
    waiting: { bg: "var(--warn-bg)", fg: "var(--warn)" },
    neutral: { bg: "var(--panel-2)", fg: "var(--soft)" },
    conflict: { bg: "var(--ember-bg)", fg: "var(--ember)" },
    missing: { bg: "var(--ember-bg)", fg: "var(--ember)" },
  };
  const tone = stateColors[record.stateVariant];

  return (
    <aside
      ref={rootRef}
      className="icg-drawer icg-drawer--evidence"
      aria-label={`Evidence record ${record.id}`}
    >
      <div className="icg-drawer-head">
        <div ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>
          <div className="icg-label icg-label--md">EVIDENCE RECORD</div>
          <h2
            style={{
              fontSize: "14px",
              fontWeight: 600,
              lineHeight: 1.35,
              margin: "3px 0 0",
              color: record.stateVariant === "missing" ? "var(--ember)" : undefined,
            }}
          >
            {record.title}
          </h2>
          <div className="icg-id" style={{ marginTop: "2px" }}>
            {record.id}
          </div>
        </div>
        <button
          type="button"
          className="icg-drawer-close"
          aria-label="Close evidence record"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="icg-drawer-body" style={{ padding: "13px 16px", gap: "13px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          <span
            className="icg-capsule"
            style={{ background: tone.bg, color: tone.fg, padding: "3px 9px" }}
          >
            <span className="icg-capsule-glyph" aria-hidden>
              {record.stateGlyph}
            </span>
            {record.state}
          </span>
          <span
            className="icg-mono icg-soft"
            style={{
              fontSize: "10px",
              padding: "3px 9px",
              borderRadius: "4px",
              border: "1px solid var(--hair-2)",
            }}
          >
            {record.source}
          </span>
        </div>

        {record.contentWithheld ? (
          <div className="icg-state" role="status">
            <span className="icg-state-glyph icg-state-glyph--solid" aria-hidden>
              ✕
            </span>
            <div>
              <div className="icg-state-title">Content restricted</div>
              <div className="icg-state-note">
                The record exists; its content is withheld for your role. Request access from
                the Controller.
              </div>
            </div>
          </div>
        ) : null}

        <dl style={{ display: "flex", flexDirection: "column", gap: "5px", margin: 0 }}>
          {record.rows.map((row) => (
            <div
              key={row.k + row.v}
              style={{
                display: "grid",
                gridTemplateColumns: "112px 1fr",
                gap: "10px",
                fontSize: "11.5px",
                padding: "4px 0",
                borderBottom: "1px solid var(--hair)",
              }}
            >
              <dt className="icg-soft">{row.k}</dt>
              <dd
                // §7: tabular numerals on every quantity, not only the mono rows.
                className={row.mono === true ? "icg-mono" : "icg-num"}
                style={{
                  margin: 0,
                  textAlign: "right",
                  fontSize: row.mono === true ? "10px" : "11.5px",
                  color: row.missing === true ? "var(--ember)" : undefined,
                  overflowWrap: "anywhere",
                }}
              >
                {row.v}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <div className="icg-label icg-label--md" style={{ marginBottom: "5px" }}>
            RELATED
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {record.related.map((r) => (
              <span
                key={r}
                className="icg-mono"
                style={{
                  fontSize: "10px",
                  color: "var(--frost)",
                  border: "1px solid var(--hair)",
                  borderRadius: "3px",
                  padding: "3px 7px",
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--hair)", paddingTop: "10px" }}>
          <AuditDetails rows={record.audit} hint="integrity & lineage" />
        </div>
      </div>
    </aside>
  );
}
