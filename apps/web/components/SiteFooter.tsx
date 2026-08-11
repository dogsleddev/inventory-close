/**
 * Site footer — maker attribution and the synthetic-data disclosure.
 *
 * Deliberately dependency-free and hook-free so it renders inside both the
 * server `not-found` page and the client `error` boundary. It carries no
 * figures: these two pages exist for the moments when the close data is
 * absent or broken, and a number rendered there would be a number nothing
 * stands behind.
 *
 * Scope note (stage A): the app shell is being edited in a separate pass, so
 * this ships on the two standalone pages only. Mounting it under
 * `AppShell`'s workspace is the remaining step.
 */

/**
 * One line, one seam. The maker is not named anywhere in this repository, so
 * the attribution describes the provenance rather than inventing a person —
 * replace this string with a name or handle when there is one to give. No
 * contact address and no outbound link: `test/synthetic-and-secrets.test.ts`
 * scans the shipped source for both.
 */
const ATTRIBUTION =
  "Designed and built as an independent demonstration of inventory close controls. Not affiliated with any system it names.";

export function SiteFooter() {
  return (
    <footer
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        paddingTop: "16px",
        borderTop: "1px solid var(--hair)",
      }}
    >
      <div className="icg-label">Inventory Close Gaurd</div>
      <div className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.6 }}>
        {ATTRIBUTION}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span className="icg-tag icg-tag--demo">SYNTHETIC DEMO</span>
        <span
          className="icg-quiet"
          style={{ fontSize: "11.5px", lineHeight: 1.6, flex: 1, minWidth: "220px" }}
        >
          KestrelGrid AI is an invented company. Every record, party and figure in
          this product is generated — none of it is real financial data.
        </span>
      </div>
    </footer>
  );
}
