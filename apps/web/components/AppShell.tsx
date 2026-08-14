"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { AskResult, ResetResultView, ShellData } from "../lib/view-model";
import { NAV_ITEMS, NAV_SECTIONS } from "../lib/nav";
import { RAIL_ATTR, RAIL_KEY, type RailState } from "../lib/rail";
import { THEME_ATTR, THEME_KEY, type Theme } from "../lib/theme";
import { AskGaurd, type AskState } from "./AskGaurd";
import { SiteFooter } from "./SiteFooter";
import { askGaurd, resetDemo } from "../app/actions";

/**
 * Application shell (design 01): nav rail, global header, workspace, and
 * the right-rail arbitration — Ask Gaurd and the page's object/evidence
 * drawer are mutually exclusive, so the workspace narrows once, never
 * twice (design/IMPLEMENTATION_HANDOFF §4).
 */

const ASK_OPEN_KEY = "icg-ask-open";

export interface AppShellProps {
  readonly shell: ShellData;
  readonly section: string;
  readonly setRoleAction: (userId: string) => Promise<void>;
  /** Breadcrumb header variant (exception detail) instead of the close title. */
  readonly breadcrumb?: {
    readonly parentLabel: string;
    readonly parentHref: string;
    readonly current: string;
    readonly note?: string;
  };
  readonly headerNote?: string;
  /** The page's own right drawer (object or evidence record). */
  readonly drawer?: ReactNode;
  readonly drawerOpen: boolean;
  readonly onCloseDrawer?: () => void;
  readonly askSuggestions: readonly string[];
  readonly askContext: string;
  /** What "this" refers to when the drawer is opened on an object. */
  readonly askScope?: { exceptionId?: string | undefined; serial?: string | undefined };
  /**
   * Defaults to the real server action, so every screen gets a working
   * assistant without threading a prop through twelve components. Tests
   * override it to answer without a server round trip.
   */
  readonly askAction?: (
    question: string,
    scope: { exceptionId?: string; serial?: string },
  ) => Promise<AskResult>;
  /** Reset Demo; overridden in tests so no server round trip is needed. */
  readonly resetAction?: () => Promise<ResetResultView>;
  readonly children: ReactNode;
}

export function AppShell(props: AppShellProps) {
  const { shell } = props;
  const [askOpen, setAskOpen] = useState(false);
  /**
   * The answer lives HERE, not inside Ask Gaurd, because opening an object
   * drawer closes Ask Gaurd (drawer arbitration, §4). If the answer lived in
   * the drawer, following a citation would destroy it — so it is lifted, and
   * reopening Ask Gaurd shows the same answer again.
   */
  const [asked, setAsked] = useState<AskState | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  /**
   * Reset Demo is a two-step control: it rebuilds the whole workspace, so
   * it asks before it acts rather than firing on a stray click during a
   * demo. The result is then stated in full — what was re-derived, what was
   * cleared, and what the append-only log kept.
   */
  const [resetStep, setResetStep] = useState<"idle" | "confirm" | "running">("idle");
  const [resetResult, setResetResult] = useState<ResetResultView | null>(null);
  const [, startTransition] = useTransition();
  const roleRef = useRef<HTMLDivElement | null>(null);
  const askHeadingRef = useRef<HTMLDivElement | null>(null);
  const askRootRef = useRef<HTMLElement | null>(null);
  const askHeaderBtnRef = useRef<HTMLButtonElement | null>(null);
  const askRailBtnRef = useRef<HTMLButtonElement | null>(null);
  const askSourceRef = useRef<"header" | "rail" | null>(null);

  // Rail persistence: reopen Ask Gaurd if the user left it open — unless
  // the page's own drawer is open (arbitration wins over persistence).
  useEffect(() => {
    try {
      if (localStorage.getItem(ASK_OPEN_KEY) === "1" && !props.drawerOpen) {
        setAskOpen(true);
      }
    } catch {
      /* storage unavailable */
    }
    // Mount-only: persistence is read once; arbitration effects handle the rest.
  }, []);

  // Opening the page drawer closes Ask Gaurd (mutual exclusivity).
  useEffect(() => {
    if (props.drawerOpen) setAskOpen(false);
  }, [props.drawerOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (roleRef.current !== null && !roleRef.current.contains(e.target as Node)) {
        setRoleOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const openAsk = (source: "header" | "rail") => {
    askSourceRef.current = source;
    props.onCloseDrawer?.();
    setAskOpen(true);
    try {
      localStorage.setItem(ASK_OPEN_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  };
  const closeAsk = useCallback(() => {
    setAskOpen(false);
    try {
      localStorage.setItem(ASK_OPEN_KEY, "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Ask Gaurd owes §7 exactly what the other drawers give, and now gets it
  // from the same hook rather than a second implementation: focus lands on
  // the heading, TAB CYCLES INSIDE the drawer instead of escaping into the
  // page behind it, Escape closes, and focus returns to whichever control
  // opened it. The tab trap matters more here than anywhere else, because
  // this is the only drawer with a text input.
  useEffect(() => {
    if (askOpen) {
      askHeadingRef.current?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeAsk();
          return;
        }
        // TAB TRAP. Ask Gaurd is the only drawer with a text input, and it
        // was the only drawer without one — Tab from the input escaped into
        // the page behind it. Cycles within the drawer, as §7 requires.
        if (e.key !== "Tab") return;
        const root = askRootRef.current;
        if (root === null) return;
        const stops = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (first === undefined || last === undefined) return;
        const active = document.activeElement;
        if (active === null || !root.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && (active === first || active === askHeadingRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    if (askSourceRef.current !== null) {
      const target =
        askSourceRef.current === "rail" ? askRailBtnRef.current : askHeaderBtnRef.current;
      target?.focus();
      askSourceRef.current = null;
    }
    return undefined;
  }, [askOpen, closeAsk]);

  const toggleTheme = () => {
    const root = document.documentElement;
    const next: Theme = root.getAttribute(THEME_ATTR) === "dark" ? "light" : "dark";
    root.setAttribute(THEME_ATTR, next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };

  const pickRole = (userId: string) => {
    setRoleOpen(false);
    startTransition(async () => {
      await props.setRoleAction(userId);
    });
  };

  const runReset = () => {
    setResetStep("running");
    const action = props.resetAction ?? resetDemo;
    startTransition(async () => {
      const result = await action();
      setResetResult(result);
      setResetStep("idle");
    });
  };

  const railClosed = !askOpen && !props.drawerOpen;

  /**
   * Rail collapse. The attribute is already on <html> before this component
   * mounts (RAIL_BOOTSTRAP in <head>), so state is seeded FROM the document
   * rather than defaulting to "expanded" and correcting itself — which would
   * flash the rail open on every one of the twenty server-rendered routes.
   */
  const [rail, setRail] = useState<RailState>("expanded");
  useEffect(() => {
    /**
     * Seeded from the stamped attribute, and FAILING BACK TO THE VIEWPORT —
     * not to "expanded".
     *
     * With no stored choice the rail's real state is whatever the 1279px
     * breakpoint decides, so assuming "expanded" made the button lie on a
     * narrow window: it read "Collapse navigation" beside a rail that was
     * already collapsed, and the first press appeared to do nothing.
     */
    const stamped = document.documentElement.getAttribute(RAIL_ATTR);
    if (stamped === "collapsed" || stamped === "expanded") {
      setRail(stamped);
      return;
    }
    /**
     * `matchMedia` is guarded because jsdom does not implement it. Falling
     * back to "expanded" is not a convenience: jsdom applies no CSS, so the
     * breakpoint never fires there and the rail genuinely is expanded. A
     * fallback of "collapsed" would have made every shell test assert against
     * a state the test environment cannot produce.
     */
    const narrow =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1279px)").matches;
    setRail(narrow ? "collapsed" : "expanded");
  }, []);

  const toggleRail = (): void => {
    const next: RailState = rail === "collapsed" ? "expanded" : "collapsed";
    setRail(next);
    // Both states are stamped. "expanded" is what overrides the breakpoint;
    // removing the attribute would hand the decision back to the viewport,
    // which is exactly what the reader just overruled.
    document.documentElement.setAttribute(RAIL_ATTR, next);
    try {
      localStorage.setItem(RAIL_KEY, next);
    } catch {
      /* Storage denied: the rail still toggles, it just will not persist. */
    }
  };

  return (
    <div className="icg-app">
      <nav className="icg-rail" aria-label="Primary">
        <div className="icg-rail-brand">
          <span className="icg-rail-brand-mark" aria-hidden>
            G
          </span>
          <span className="icg-rail-brand-name">Close Gaurd</span>
        </div>
        <div className="icg-rail-company">KESTRELGRID AI</div>
        {/*
          Directly under the brand, not at the foot of the rail. Collapsed, the
          rail is 56px of numbers and the control has to be the first thing a
          reader's eye lands on; at the bottom it was below the fold on a short
          window, which is exactly where the breakpoint collapses the rail.
          The LABEL says what pressing it does, and flips with the state.
        */}
        <button
          type="button"
          className="icg-rail-toggle"
          onClick={toggleRail}
          aria-expanded={rail === "expanded"}
          aria-label={rail === "collapsed" ? "Expand navigation" : "Collapse navigation"}
          title={rail === "collapsed" ? "Expand navigation" : "Collapse navigation"}
        >
          <span className="icg-rail-toggle-glyph" aria-hidden>
            {rail === "collapsed" ? "»" : "«"}
          </span>
          <span className="icg-rail-toggle-text">
            {rail === "collapsed" ? "EXPAND" : "COLLAPSE"}
          </span>
        </button>
        <div className="icg-rail-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="icg-nav-group">
              {/*
                The heading is decorative-by-position, not by omission: the
                group is a real <ul> labelled by it, so a screen reader gets
                the same grouping a sighted reader gets from the rule above
                it. Hidden when the rail collapses, like every other label.
              */}
              <div className="icg-nav-group-title" aria-hidden>
                {section.title}
              </div>
              <ul className="icg-nav-group-list" aria-label={section.title}>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="icg-nav-item"
                      aria-current={item.label === props.section ? "page" : undefined}
                    >
                      <span className="icg-nav-bar" aria-hidden />
                      {/*
                        The number is the ONLY visible identifier once the rail
                        collapses, so it is derived from the flat projection
                        rather than from the index within a group — two items
                        numbered 01 in different groups would be worse than no
                        number at all.
                      */}
                      <span className="icg-nav-num" aria-hidden>
                        {String(NAV_ITEMS.indexOf(item) + 1).padStart(2, "0")}
                      </span>
                      <span className="icg-nav-label">{item.label}</span>
                      {item.label === "Exceptions" && shell.navOpenBlockers !== null ? (
                        <span className="icg-nav-badge">{shell.navOpenBlockers}</span>
                      ) : null}
                      {item.label === "How to Explore" ? (
                        <span className="icg-nav-start">START HERE</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="icg-rail-footer">
          {shell.dataHealthPct !== null ? (
            <div className="icg-rail-health">
              <span className="icg-rail-health-dot" aria-hidden />
              <span>
                Data Health <strong>{shell.dataHealthPct}</strong>
              </span>
            </div>
          ) : null}
          <div className="icg-rail-user">
            <span className="icg-rail-avatar" aria-hidden>
              {shell.initials}
            </span>
            <div className="icg-rail-user-meta" style={{ minWidth: 0 }}>
              <div className="icg-rail-user-name">{shell.displayName}</div>
              <div className="icg-rail-user-role">{shell.roleLabel} · Demo</div>
            </div>
          </div>
        </div>
      </nav>

      <div className="icg-main">
        <header className="icg-header">
          <div className="icg-crumbs">
            {props.breadcrumb !== undefined ? (
              <>
                <Link href={props.breadcrumb.parentHref} style={{ fontSize: "11.5px" }}>
                  {props.breadcrumb.parentLabel}
                </Link>
                <span className="icg-crumb-sep" aria-hidden>
                  /
                </span>
                <span className="icg-mono" style={{ fontSize: "11.5px" }}>
                  {props.breadcrumb.current}
                </span>
                <span className="icg-crumb-date">FY2026 · Dec. 31, 2026</span>
              </>
            ) : (
              <>
                <span className="icg-crumb-org">KESTRELGRID AI</span>
                <span className="icg-crumb-sep" aria-hidden>
                  /
                </span>
                <span className="icg-crumb-title">FY2026 Inventory Close</span>
                <span className="icg-crumb-date">Dec. 31, 2026</span>
                {shell.periodLabel !== null ? (
                  <span className="icg-tag icg-tag--period">{shell.periodLabel}</span>
                ) : null}
              </>
            )}
            <span className="icg-tag icg-tag--demo">SYNTHETIC DEMO</span>
          </div>
          <div className="icg-header-right">
            {props.headerNote !== undefined ? (
              <span style={{ fontSize: "11.5px" }} className="icg-soft">
                {props.headerNote}
              </span>
            ) : null}
            {shell.headerKpis !== null ? (
              <div className="icg-header-kpis">
                <span className="icg-num">{shell.headerKpis.ready}</span>
                <span className="icg-header-blockers">
                  <span className="icg-header-blockers-dot" aria-hidden />
                  {shell.headerKpis.blockers}
                </span>
              </div>
            ) : null}
            <div className="icg-role" ref={roleRef}>
              <button
                type="button"
                className="icg-role-btn"
                aria-haspopup="menu"
                aria-expanded={roleOpen}
                onClick={() => setRoleOpen((v) => !v)}
              >
                <span className="icg-role-label">ROLE</span>
                <span style={{ fontWeight: 600 }}>{shell.roleLabel}</span>
                <span className="icg-quiet" style={{ fontSize: "9px" }} aria-hidden>
                  ▾
                </span>
              </button>
              {roleOpen ? (
                <div
                  className="icg-role-menu"
                  role="menu"
                  aria-label="Switch role"
                  // The menu role promises this keyboard contract; without it a
                  // keyboard user cannot leave the menu without changing role.
                  onKeyDown={(e) => {
                    const items = Array.from(
                      e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        '[role="menuitemradio"]',
                      ),
                    );
                    const i = items.indexOf(document.activeElement as HTMLButtonElement);
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRoleOpen(false);
                      roleRef.current?.querySelector<HTMLButtonElement>(".icg-role-btn")?.focus();
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      items[(i + 1 + items.length) % items.length]?.focus();
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      items[(i - 1 + items.length) % items.length]?.focus();
                    }
                  }}
                  ref={(node) => {
                    if (node === null) return;
                    const items = node.querySelectorAll<HTMLButtonElement>(
                      '[role="menuitemradio"]',
                    );
                    const checked = node.querySelector<HTMLButtonElement>('[aria-checked="true"]');
                    (checked ?? items[0])?.focus();
                  }}
                >
                  {shell.roles.map((r) => (
                    <button
                      key={r.userId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={r.userId === shell.userId}
                      className="icg-role-option"
                      onClick={() => pickRole(r.userId)}
                    >
                      <span className="icg-role-check" aria-hidden>
                        {r.userId === shell.userId ? "✓" : ""}
                      </span>
                      {r.roleLabel} · {r.displayName}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {shell.canResetDemo ? (
              resetStep === "confirm" ? (
                <span
                  className="icg-reset-confirm"
                  role="group"
                  aria-label="Confirm demo reset"
                >
                  <span style={{ fontSize: "11px" }}>Rebuild the demo from its seed?</span>
                  <button
                    type="button"
                    className="icg-btn icg-btn--mono"
                    onClick={runReset}
                  >
                    Confirm reset
                  </button>
                  <button
                    type="button"
                    className="icg-linkbtn"
                    onClick={() => setResetStep("idle")}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icg-btn icg-btn--mono"
                  disabled={resetStep === "running"}
                  onClick={() => setResetStep("confirm")}
                >
                  {resetStep === "running" ? "Resetting…" : "Reset Demo"}
                </button>
              )
            ) : null}
            {/* The print stylesheet has always existed — it drops the rails
                and un-clips the tables so any screen prints as a single
                workpaper. Nothing said so, which made the one path out of
                this product invisible. */}
            <button
              type="button"
              className="icg-btn icg-btn--mono"
              onClick={() => window.print()}
              title="Print this screen as a workpaper"
            >
              PRINT
            </button>
            <button type="button" className="icg-btn icg-btn--mono" onClick={toggleTheme}>
              THEME
            </button>
            <button
              ref={askHeaderBtnRef}
              type="button"
              className="icg-btn icg-btn--primary"
              aria-expanded={askOpen}
              onClick={() => openAsk("header")}
            >
              Ask Gaurd
            </button>
          </div>
        </header>

        {resetResult !== null ? (
          <div className="icg-reset-note" role="status">
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600 }}>
                {resetResult.ok ? "Demo reset" : "Reset refused"}
                {resetResult.ok ? (
                  <span className="icg-quiet" style={{ fontWeight: 400 }}>
                    {" · "}
                    {resetResult.headline}
                  </span>
                ) : null}
              </div>
              <div className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                {resetResult.detail}
              </div>
            </div>
            <button
              type="button"
              className="icg-linkbtn"
              onClick={() => setResetResult(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {props.children}
        {/* Attribution and the synthetic-data disclosure, on every screen and
            on every printed page — the demo used to have no way to say who
            built it or that its figures are invented. */}
        <div style={{ padding: "0 20px 20px" }}>
          <SiteFooter showDemoTag={false} />
        </div>
      </div>

      {props.drawerOpen ? props.drawer : null}

      {askOpen ? (
        <aside className="icg-drawer icg-drawer--ask" aria-label="Ask Gaurd" ref={askRootRef}>
          <div
            className="icg-drawer-head"
            style={{ alignItems: "center", padding: "12px 16px" }}
          >
            <div
              ref={askHeadingRef}
              tabIndex={-1}
              style={{ display: "flex", alignItems: "center", gap: "8px", outline: "none" }}
            >
              <span className="icg-gmark icg-gmark--sm" aria-hidden>
                G
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Ask Gaurd</span>
              <span
                className="icg-mono icg-soft"
                style={{
                  fontSize: "9px",
                  letterSpacing: "0.1em",
                  border: "1px solid var(--hair)",
                  borderRadius: "3px",
                  padding: "2px 6px",
                }}
              >
                INVESTIGATION
              </span>
            </div>
            <button
              type="button"
              className="icg-drawer-close"
              aria-label="Collapse Ask Gaurd"
              onClick={closeAsk}
            >
              ⟩
            </button>
          </div>
          <AskGaurd
            context={props.askContext}
            suggestions={props.askSuggestions}
            scope={props.askScope ?? {}}
            state={asked}
            onState={setAsked}
            askAction={props.askAction ?? askGaurd}
          />
        </aside>
      ) : null}

      {railClosed ? (
        <button
          ref={askRailBtnRef}
          type="button"
          className="icg-askrail"
          aria-label="Open Ask Gaurd"
          aria-expanded={false}
          onClick={() => openAsk("rail")}
        >
          <span className="icg-gmark" aria-hidden>
            G
          </span>
          <span className="icg-askrail-label" aria-hidden>
            ASK GAURD
          </span>
        </button>
      ) : null}
    </div>
  );
}
