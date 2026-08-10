"use client";

import Link from "next/link";
import type { InventorySearchData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { SerialSearchBar } from "./FinancialLifeScreen";
import { NoRecordsState, Panel, PanelHead, RestrictedState } from "./kit";

/**
 * Inventory — global serial search (docs/11: one click to Financial Life).
 * A hit says where the serial was seen and whether it is on the year-end
 * book; it never implies book membership.
 */
export function InventorySearchScreen({
  shell,
  data,
  setRoleAction,
}: {
  shell: ShellData;
  data: InventorySearchData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  return (
    <AppShell
      shell={shell}
      section="Inventory"
      setRoleAction={setRoleAction}
      drawerOpen={false}
      askSuggestions={[
        "Which serials have open exceptions?",
        "Where was this serial last seen?",
      ]}
      askContext="FY2026 Inventory Close · Serial search"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Inventory</h1>
            <div className="icg-page-context">
              {data.bookCountNote ?? "FY2026 · balance-sheet date Dec. 31, 2026"}
            </div>
          </div>
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="the inventory listing" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <div
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <SerialSearchBar initial={data.query} />
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span className="icg-soft" style={{ fontSize: "11.5px" }}>
                    Open-exception serials:
                  </span>
                  {data.notable.map((n) => (
                    <Link
                      key={n.serial}
                      href={`/inventory/${n.serial}`}
                      className="icg-mono"
                      style={{
                        fontSize: "10.5px",
                        border: "1px solid var(--hair)",
                        borderRadius: "3px",
                        padding: "3px 8px",
                      }}
                      title={n.note}
                    >
                      {n.serial}
                    </Link>
                  ))}
                </div>
              </div>
            </Panel>

            {data.hits !== null ? (
              <Panel>
                <PanelHead
                  large
                  title={`Serial search — “${data.query}”`}
                  sub="A hit lists every source that mentions the serial. On-book means the year-end listing contains it; nothing else implies membership."
                />
                {data.hits.length === 0 ? (
                  <div style={{ padding: "14px 18px" }}>
                    <NoRecordsState
                      note={`No source in the dataset mentions “${data.query}” — verified empty, not assumed.`}
                    />
                  </div>
                ) : (
                  <div className="icg-table-wrap">
                    <table className="icg-table">
                      <thead>
                        <tr>
                          <th scope="col">Serial</th>
                          <th scope="col">Year-end book</th>
                          <th scope="col">SKU</th>
                          <th scope="col">NetSuite location</th>
                          <th scope="col">Seen in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.hits.map((hit) => (
                          <tr key={hit.serial}>
                            <td>
                              <Link
                                href={`/inventory/${hit.serial}`}
                                className="icg-row-link icg-row-id"
                              >
                                {hit.serial}
                              </Link>
                            </td>
                            <td>
                              {hit.onBook ? (
                                <span style={{ fontSize: "11.5px" }}>
                                  <span aria-hidden style={{ color: "var(--aurora)", marginRight: "4px" }}>
                                    ✓
                                  </span>
                                  On the listing
                                </span>
                              ) : (
                                <span style={{ fontSize: "11.5px", color: "var(--ember)", fontWeight: 600 }}>
                                  <span aria-hidden style={{ marginRight: "4px" }}>
                                    ○
                                  </span>
                                  Not on the listing
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="icg-mono" style={{ fontSize: "11px" }}>
                                {hit.sku ?? "—"}
                              </span>
                            </td>
                            <td style={{ fontSize: "12px" }}>{hit.location ?? "—"}</td>
                            <td>
                              <span className="icg-mono icg-soft" style={{ fontSize: "9.5px" }}>
                                {hit.foundIn.join(" · ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            ) : (
              <Panel>
                <div style={{ padding: "20px 18px" }}>
                  <div className="icg-state" role="status">
                    <span className="icg-state-glyph" aria-hidden>
                      ⌕
                    </span>
                    <div>
                      <div className="icg-state-title">Search a serial to open its Financial Life</div>
                      <div className="icg-state-note">
                        The search covers the book listing, count sheets, NetSuite transactions,
                        carrier events, assignments, RMA records and telemetry — so off-book
                        observations are discoverable too.
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
