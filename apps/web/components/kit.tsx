"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { TabDef } from "../lib/view-model";
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

/**
 * Tab bar (stage 06) — ember underline, optional count. Client-side, no
 * reload; switching tabs never changes the object in an open drawer (§4).
 *
 * The tablist role promises a keyboard contract, so it is implemented here
 * rather than declared and left unhonoured: one tab stop for the whole set
 * (roving tabindex), Arrow keys move and select, Home/End jump to the ends.
 * Each tab owns its panel by id so assistive tech can follow the pair.
 */
export function TabBar({
  tabs,
  active,
  onSelect,
  label,
  panelId,
}: {
  tabs: readonly TabDef[];
  active: string;
  onSelect: (key: string) => void;
  label: string;
  panelId: string;
}) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = tabs.map((t) => t.key);
    const i = keys.indexOf(active);
    const go = (next: number) => {
      event.preventDefault();
      const at = (next + keys.length) % keys.length;
      const key = keys[at];
      if (key === undefined) return;
      onSelect(key);
      // Selection follows focus, so move focus with it.
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
      buttons[at]?.focus();
    };
    if (event.key === "ArrowRight") go(i + 1);
    else if (event.key === "ArrowLeft") go(i - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(keys.length - 1);
  };

  return (
    <div className="icg-tabs" role="tablist" aria-label={label} onKeyDown={move}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`${panelId}-tab-${t.key}`}
          aria-selected={t.key === active}
          aria-controls={panelId}
          tabIndex={t.key === active ? 0 : -1}
          className={`icg-tab${t.key === active ? " icg-tab--active" : ""}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          {t.count !== null ? <span className="icg-tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * The way out of a screen: this population as a spreadsheet.
 *
 * The export route handlers have existed since Stage B and nothing linked to
 * them, so the one path out of this product was reachable only by typing a
 * URL. A capability with no affordance is a capability the user does not
 * have.
 *
 * `scopeNote` is not decoration. Several screens show a NARROWER population
 * than their file contains — the exception queue filtered to a control
 * domain, the reconciliation screen's non-financial tabs — and a bare
 * "EXPORT CSV" on those screens would promise the view and deliver the
 * population. Where the two differ, the difference is stated, and it is tied
 * to the link by `aria-describedby` so it reaches a screen reader as part of
 * the control rather than as loose text beside it.
 *
 * Render this only where the viewer can actually read the data: offering a
 * download that answers 403 is a worse failure than offering nothing.
 */
export function ExportCsvLink({
  table,
  label,
  scopeNote,
}: {
  table: string;
  label: string;
  scopeNote?: string;
}) {
  const noteId = `icg-export-note-${table}`;
  return (
    <div className="icg-export">
      <a
        className="icg-btn icg-btn--mono"
        href={`/api/export/${table}`}
        download
        aria-label={`Export ${label} as CSV`}
        {...(scopeNote !== undefined ? { "aria-describedby": noteId } : {})}
      >
        EXPORT CSV
      </a>
      {scopeNote !== undefined ? (
        <span id={noteId} className="icg-export-note">
          {scopeNote}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A screen whose population has no export table says so, in the slot where
 * the button sits everywhere else.
 *
 * Silence would be the one answer this codebase already rejects — disabled
 * actions are never hidden here, they carry their reason beneath (the
 * sign-off gate is the pattern). A reader who finds EXPORT CSV on six screens
 * and nothing on the seventh has no way to tell "cannot be exported" from
 * "someone forgot". A dead button would be worse still: these are permanently
 * absent, not temporarily blocked, so there is a sentence rather than a
 * control that can never become live.
 */
export function ExportUnavailableNote({ reason }: { reason: string }) {
  return (
    <div className="icg-export">
      <span className="icg-export-note">{reason}</span>
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
