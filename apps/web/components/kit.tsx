"use client";

import { useState, type ReactNode } from "react";
import type { RiskView, StatusView } from "../lib/workflow-view";

/**
 * Shared presentational kit (stage 05) — the reuse-7 components from
 * design/IMPLEMENTATION_HANDOFF §2. Status is never colour alone: every
 * state chip carries its glyph and label together.
 */

export function StatusCapsule({ status }: { status: StatusView }) {
  return (
    <span className={`icg-capsule icg-capsule--${status.variant}`}>
      <span className="icg-capsule-glyph" aria-hidden>
        {status.glyph}
      </span>
      {status.label}
    </span>
  );
}

export function RiskIndicator({
  risk,
  outline = false,
}: {
  risk: RiskView;
  outline?: boolean;
}) {
  return (
    <span
      className={`icg-risk icg-risk--${risk.variant}${outline ? " icg-risk--outline" : ""}`}
    >
      <span className="icg-risk-glyph" aria-hidden>
        {risk.glyph}
      </span>
      {risk.label}
    </span>
  );
}

export function Panel({
  decision = false,
  className = "",
  children,
}: {
  decision?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`icg-panel${decision ? " icg-panel--decision" : ""}${className !== "" ? ` ${className}` : ""}`}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  sub,
  right,
  large = false,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  large?: boolean;
}) {
  return (
    <header className="icg-panel-head">
      <div>
        <h2 className={`icg-panel-title${large ? " icg-panel-title--lg" : ""}`}>{title}</h2>
        {sub !== undefined ? <div className="icg-panel-sub">{sub}</div> : null}
      </div>
      {right !== undefined ? <div>{right}</div> : null}
    </header>
  );
}

/**
 * Audit Details — collapsed by default everywhere; open state is local and
 * never remembered between objects (design/IMPLEMENTATION_HANDOFF §4).
 */
export function AuditDetails({
  rows,
  hint = "provenance & review history",
}: {
  rows: readonly { k: string; v: string }[];
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="icg-audit-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="icg-audit-caret" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="icg-audit-title">Audit Details</span>
        <span className="icg-audit-hint">{hint}</span>
      </button>
      {open ? (
        <dl className="icg-audit-body">
          {rows.map((row) => (
            <div key={row.k} className="icg-audit-row">
              <dt className="icg-audit-key">{row.k}</dt>
              <dd className="icg-audit-val" style={{ margin: 0 }}>
                {row.v}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/**
 * Non-result states (design 01): a Controller must never confuse "we
 * checked and it is zero" with "we could not see the data".
 */
export function RestrictedState({ roleLabel, what }: { roleLabel: string; what: string }) {
  return (
    <div className="icg-state" role="status">
      <span className="icg-state-glyph icg-state-glyph--solid" aria-hidden>
        ✕
      </span>
      <div>
        <div className="icg-state-title">Access restricted</div>
        <div className="icg-state-note">
          Your role — <strong>{roleLabel}</strong> — cannot view {what}. Request access from
          the Controller. No figure is shown — not a zero.
        </div>
      </div>
    </div>
  );
}

/**
 * A section emptied by the viewer's scope rather than by the data. Says which
 * it is — an empty evidence list must never read as "there is no evidence".
 */
export function ScopeNotice({ text }: { text: string }) {
  return (
    <div className="icg-state" role="status">
      <span className="icg-state-glyph" aria-hidden>
        ◑
      </span>
      <div>
        <div className="icg-state-title">Outside your scope</div>
        <div className="icg-state-note">{text}</div>
      </div>
    </div>
  );
}

export function NoRecordsState({ note }: { note: string }) {
  return (
    <div className="icg-state" role="status">
      <span className="icg-state-glyph" aria-hidden>
        ○
      </span>
      <div>
        <div className="icg-state-title">No records</div>
        <div className="icg-state-note">{note}</div>
      </div>
    </div>
  );
}

/** Source-coverage chip: a degraded source states it inside the chip. */
export function SourceStateChip({ text }: { text: string }) {
  const degraded = /STALE|PARTIAL|FAILED/.test(text);
  return (
    <span
      className={`icg-source-chip${degraded ? " icg-source-chip--degraded" : ""}`}
    >
      <span className="icg-source-chip-glyph" aria-hidden>
        {text.includes("STALE") ? "◔" : text.includes("PARTIAL") ? "◐" : text.includes("FAILED") ? "✕" : "●"}
      </span>
      {text}
    </span>
  );
}
