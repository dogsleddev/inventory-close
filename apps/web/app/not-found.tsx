import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";

/**
 * 404 (stage A, COMPLETION_PLAN §3.10). Before this existed a mistyped
 * address landed on Next's unstyled default with no way back into the close.
 *
 * It is deliberately a non-result state in the product's own vocabulary
 * (design 01): it says which of the two things happened — the address is
 * unknown, not the data is missing — and it never shows a figure, because on
 * this page there is nothing behind one.
 */

export const metadata: Metadata = { title: "Page not found" };

const LINK_BASE = {
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
} as const;

export default function NotFound() {
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
            <span className="icg-state-glyph" aria-hidden>
              ○
            </span>
            <div>
              <h1 className="icg-page-title" style={{ fontSize: "20px" }}>
                Page not found
              </h1>
              <div className="icg-page-context">
                No screen or record answers to this address
              </div>
            </div>
          </div>

          <p
            className="icg-soft"
            style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.65 }}
          >
            The address does not match a screen in this close, and it does not
            match a record the dataset contains. That is the whole of it — no
            close data is missing and nothing failed. Serial and exception
            addresses are case-insensitive, but the identifier has to be one the
            FY2026 dataset actually holds.
          </p>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/"
              className="icg-btn icg-btn--primary"
              style={{ ...LINK_BASE, color: "var(--inv)" }}
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
