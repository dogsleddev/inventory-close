"use client";

import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";

/**
 * Route error boundary (stage A, COMPLETION_PLAN §3.10). A client component,
 * because `reset` is a callback the boundary owns.
 *
 * The copy states what is and is not known. It does not apologise, does not
 * guess a cause, and shows no figure — a screen that failed to render has
 * nothing standing behind a number. The digest is surfaced when Next supplies
 * one, because it is the only handle a viewer can quote.
 */

const LINK_BASE = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
} as const;

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <section
          className="icg-panel icg-panel--decision"
          style={{
            padding: "22px 24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="icg-state-glyph icg-state-glyph--warn-solid"
              aria-hidden
            >
              ✕
            </span>
            <div>
              <h1 className="icg-page-title" style={{ fontSize: "20px" }}>
                This screen did not render
              </h1>
              <div className="icg-page-context">
                The close itself is unaffected
              </div>
            </div>
          </div>

          <p
            className="icg-soft"
            style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.65 }}
          >
            Something failed while this page was being built. The close is
            recomputed from the dataset on every request, so trying again is a
            real second attempt rather than a reload of a stale result. If it
            fails the same way twice, the fault is in the screen, not the data.
          </p>

          {error.digest !== undefined ? (
            <div
              className="icg-mono icg-quiet"
              style={{ fontSize: "11px", letterSpacing: "0.04em" }}
            >
              Reference {error.digest}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="icg-btn icg-btn--primary"
              onClick={reset}
            >
              Try again
            </button>
            <Link
              href="/"
              className="icg-btn icg-btn--ghost"
              style={{ ...LINK_BASE, color: "var(--ink)" }}
            >
              Go to Overview
            </Link>
            <Link
              href="/exceptions"
              className="icg-btn icg-btn--ghost"
              style={{ ...LINK_BASE, color: "var(--ink)" }}
            >
              Open the exception queue
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
