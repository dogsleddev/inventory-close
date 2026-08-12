"use client";

import Link from "next/link";
import type { InventorySearchData, ShellData } from "../lib/view-model";
import type {
  InventoryFilterField,
  InventoryMasterData,
} from "../lib/server/inventory-list-view";
import { AppShell } from "./AppShell";
import { SerialSearchBar } from "./FinancialLifeScreen";
import {
  ExportCsvLink,
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  StatusCapsule,
} from "./kit";

/**
 * Inventory — the master population, with the global serial search kept on
 * top of it (docs/11: one click to Financial Life).
 *
 * Two questions, deliberately answered separately on one page:
 *
 *   - **Where was this serial seen?** The search reaches beyond the year-end
 *     listing — count sheets, NetSuite transactions, carrier events,
 *     assignments, RMA records, telemetry — so an off-book observation is
 *     discoverable. A hit never implies book membership.
 *   - **What do we have?** The master list is the book population itself:
 *     one row per unit, everything on it derived, filtered server-side.
 *
 * `master` is optional so the search surface stands alone where a caller
 * only needs the lookup.
 */
export function InventorySearchScreen({
  shell,
  data,
  master,
  setRoleAction,
}: {
  shell: ShellData;
  data: InventorySearchData;
  master?: InventoryMasterData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const showMaster = master !== undefined && !master.restricted;

  return (
    <AppShell
      shell={shell}
      section="Inventory"
      setRoleAction={setRoleAction}
      drawerOpen={false}
      /**
       * "Where was this serial last seen?" shipped here until Stage G and
       * could never be answered: this screen searches serials, so nothing
       * scopes the drawer to one and the question names none. A chip whose
       * own screen cannot supply its subject is a refusal with a button on
       * it. Asked from a unit's page, where a serial IS in scope, the same
       * question now answers.
       */
      askSuggestions={[
        "Which serials have open exceptions?",
        "Where is our inventory physically held?",
      ]}
      askContext="FY2026 Inventory Close · Serial search"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Inventory</h1>
            <div className="icg-page-context">
              {showMaster
                ? `${master.populationNote} · ${master.asOfNote}`
                : (data.bookCountNote ?? "FY2026 · balance-sheet date Dec. 31, 2026")}
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="inventory"
              label="the year-end inventory listing"
              scopeNote="Every unit on the year-end listing — not this filter, page or search."
            />
          )}
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
                {showMaster ? (
                  <FilterBar master={master} />
                ) : (
                  <SerialSearchBar initial={data.query} />
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span className="icg-soft" style={{ fontSize: "11.5px" }}>
                    Open-exception serials:
                  </span>
                  {data.notable.map((n) => (
                    <Link
                      key={n.serial}
                      href={`/inventory/${n.serial}`}
                      className="icg-serial-chip"
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
            ) : null}

            {showMaster ? (
              <MasterListPanel master={master} />
            ) : data.hits === null ? (
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
            ) : null}
          </>
        )}
      </main>
    </AppShell>
  );
}

/**
 * One GET form for the serial box and every filter, so a submission never
 * silently drops the other filters. No JavaScript is required to filter the
 * population — the query string is the state.
 */
function FilterBar({ master }: { master: InventoryMasterData }) {
  return (
    <form
      action="/inventory"
      method="get"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}
    >
      <span className="icg-lookup" style={{ minWidth: "210px" }}>
        <span aria-hidden style={{ fontSize: "12px", color: "var(--quiet)" }}>
          ⌕
        </span>
        <input
          type="text"
          name="q"
          defaultValue={master.serialQuery}
          aria-label="Serial search"
          placeholder="Search a serial…"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="icg-lookup-hint">SERIAL</span>
      </span>
      {master.filters.map((field) => (
        <FilterSelect key={field.name} field={field} />
      ))}
      <button type="submit" className="icg-btn icg-btn--primary">
        Apply
      </button>
      {master.activeFilterCount > 0 ? (
        <Link href={master.clearHref} className="icg-btn icg-btn--ghost">
          Clear {master.activeFilterCount}
        </Link>
      ) : null}
    </form>
  );
}

function FilterSelect({ field }: { field: InventoryFilterField }) {
  return (
    <label className="icg-lookup" style={{ minWidth: "auto", padding: "5px 9px", gap: "6px" }}>
      <span className="icg-lookup-hint">{field.label.toUpperCase()}</span>
      <select
        name={field.name}
        defaultValue={field.value}
        aria-label={`Filter by ${field.label}`}
        style={{
          border: "none",
          background: "transparent",
          fontFamily: "var(--font-mono)",
          fontSize: "11.5px",
          color: "var(--ink)",
          maxWidth: "180px",
          outline: "none",
        }}
      >
        <option value="">All</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.count === null ? o.label : `${o.label} · ${o.count}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The master table. The population is 1,500 rows and the page renders one
 * hundred at a time: filtering and paging both happen on the server, so the
 * browser never receives a population it cannot render.
 */
function MasterListPanel({ master }: { master: InventoryMasterData }) {
  return (
    <Panel>
      <PanelHead
        large
        title="All inventory"
        sub="Every unit on the FY2026 year-end listing, one row each. Nothing here is grouped and nothing is off-book."
        right={
          <div style={{ textAlign: "right" }}>
            <div className="icg-num" style={{ fontSize: "12px", fontWeight: 600 }}>
              {master.resultNote} · {master.resultCarrying}
            </div>
            <div className="icg-quiet icg-num" style={{ fontSize: "10.5px" }}>
              {master.paging.rangeNote}
            </div>
          </div>
        }
      />
      {master.emptyNote !== null ? (
        <div style={{ padding: "18px 20px" }}>
          <NoRecordsState note={master.emptyNote} />
        </div>
      ) : (
        <div className="icg-table-wrap">
          <table className="icg-table">
            <thead>
              <tr>
                <th scope="col">Serial</th>
                <th scope="col">SKU</th>
                <th scope="col">Product</th>
                <th scope="col" className="icg-cell-right">
                  Qty
                </th>
                <th scope="col">Location</th>
                <th scope="col">Custody</th>
                <th scope="col">Classification</th>
                <th scope="col">Ownership</th>
                <th scope="col" className="icg-cell-right">
                  Unit cost
                </th>
                <th scope="col" className="icg-cell-right">
                  Carrying
                </th>
                <th scope="col">GL</th>
                <th scope="col">Last count</th>
                <th scope="col">Age</th>
                <th scope="col">Exception</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {master.rows.map((row) => (
                <tr key={row.serial}>
                  <td>
                    <Link href={row.href} className="icg-row-link icg-row-id">
                      {row.serial}
                    </Link>
                    {row.trackingNote !== null ? (
                      <div className="icg-quiet" style={{ fontSize: "9.5px", marginTop: "2px" }}>
                        {row.trackingNote}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className="icg-mono" style={{ fontSize: "11px" }}>
                      {row.sku}
                    </span>
                  </td>
                  <td style={{ fontSize: "12px" }}>{row.product}</td>
                  <td className="icg-cell-right icg-num">{row.quantity}</td>
                  <td style={{ fontSize: "12px" }}>{row.location}</td>
                  <td style={{ fontSize: "12px" }}>
                    {row.custody}
                    {row.custodian !== null ? (
                      <div className="icg-quiet" style={{ fontSize: "9.5px", marginTop: "2px" }}>
                        {row.custodian}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ fontSize: "12px" }}>{row.classification}</td>
                  <td style={{ fontSize: "12px" }}>
                    {row.ownershipUnderReview ? (
                      <span style={{ color: "var(--ember)", fontWeight: 600 }}>
                        {row.ownership}
                      </span>
                    ) : (
                      row.ownership
                    )}
                  </td>
                  <td className="icg-cell-money" style={{ fontSize: "12px" }}>
                    {row.unitCost}
                  </td>
                  <td className="icg-cell-money" style={{ fontSize: "12px" }}>
                    {row.carrying}
                  </td>
                  <td>
                    <span className="icg-mono" style={{ fontSize: "11px" }}>
                      {row.glAccount}
                    </span>
                  </td>
                  <td style={{ fontSize: "11.5px" }}>
                    {row.lastCount === null ? (
                      <span className="icg-soft">No count line covers it</span>
                    ) : (
                      <>
                        <div>{row.lastCount.when}</div>
                        <div className="icg-quiet" style={{ fontSize: "9.5px" }}>
                          {row.lastCount.what}
                          {row.lastCount.variance !== null ? ` · ${row.lastCount.variance}` : ""}
                        </div>
                      </>
                    )}
                  </td>
                  <td style={{ fontSize: "11.5px" }}>
                    <div className="icg-num">{row.age}</div>
                    <div className="icg-quiet" style={{ fontSize: "9.5px" }}>
                      {row.ageBand}
                    </div>
                  </td>
                  <td>
                    {row.exceptions.length === 0 ? (
                      <span className="icg-quiet" style={{ fontSize: "11px" }}>
                        —
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {row.exceptions.map((e) => (
                          <Link
                            key={e.id}
                            href={e.href}
                            className="icg-serial-chip icg-row-link"
                            title={e.basisNote}
                            style={
                              e.namesUnit
                                ? undefined
                                : { color: "var(--soft)", borderStyle: "dashed" }
                            }
                          >
                            {e.namesUnit ? e.id : `${e.id} · population`}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusCapsule status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div
        className="icg-panel-foot"
        style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}
      >
        <span className="icg-soft" style={{ fontSize: "11px" }}>
          Page {master.paging.page} of {master.paging.pageCount}
        </span>
        {master.paging.prevHref !== null ? (
          <Link href={master.paging.prevHref} className="icg-btn icg-btn--ghost">
            ← Previous
          </Link>
        ) : null}
        {master.paging.nextHref !== null ? (
          <Link href={master.paging.nextHref} className="icg-btn icg-btn--ghost">
            Next →
          </Link>
        ) : null}
      </div>
      <div className="icg-panel-foot">
        <ul style={{ margin: 0, paddingLeft: "16px" }}>
          {master.notes.map((note) => (
            <li key={note} className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.5 }}>
              {note}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
