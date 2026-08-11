"use client";

import { useState } from "react";
import type { CostingData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { ExceptionDrawer } from "./ExceptionDrawer";
import {
  ExportCsvLink,
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  StatStrip,
  TabBar,
} from "./kit";

/**
 * Costing (COMPLETION_PLAN Stage D) — which costs belong in inventory.
 *
 * Four tabs: the standard cost stack that makes up the inventory balance, how
 * those components behave with volume, the FY2026 pools deliberately kept out
 * of inventory, and whether the cost of a sold unit has left the book.
 *
 * The two decision panels on this screen — the decomposition on the stack tab
 * and the containment statement on the period tab — render from a boolean the
 * services layer MEASURED. Both say the opposite if the measurement fails,
 * and neither is written as prose that happens to be true today.
 */
export function CostingScreen({
  shell,
  data,
  initialTab,
  setRoleAction,
}: {
  shell: ShellData;
  data: CostingData;
  /** `?tab=` deep link; an unknown value falls back to the stack tab. */
  initialTab?: string | undefined;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>(
    initialTab !== undefined && data.tabs.some((t) => t.key === initialTab)
      ? initialTab
      : "stack",
  );
  const [exceptionId, setExceptionId] = useState<string | null>(null);
  const drawer = exceptionId !== null ? data.drawers[exceptionId] : undefined;
  const closeDrawer = () => setExceptionId(null);
  const openException = (id: string | null) => {
    if (id !== null && data.drawers[id] !== undefined) setExceptionId(id);
  };

  return (
    <AppShell
      shell={shell}
      section="Costing"
      setRoleAction={setRoleAction}
      {...(data.headerNote !== null ? { headerNote: data.headerNote } : {})}
      drawerOpen={drawer !== undefined}
      onCloseDrawer={closeDrawer}
      drawer={
        drawer !== undefined ? (
          <ExceptionDrawer data={drawer} onClose={closeDrawer} />
        ) : undefined
      }
      askSuggestions={[
        "What makes up the standard cost of a unit?",
        "Which costs did we keep out of inventory this year, and why?",
        "Has the cost of everything we sold left the book?",
      ]}
      askContext="FY2026 Inventory Close · Costing"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Costing</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date {data.asOf === "" ? "Dec. 31, 2026" : data.asOf}
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="costing"
              label="the costing populations"
              scopeNote="The cost stack, the period pools and the COGS states together, not just this tab."
            />
          )}
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="costing data" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={data.tabs}
                active={tab}
                onSelect={setTab}
                label="Costing tabs"
                panelId="icg-cost-panel"
              />
            </Panel>

            <div
              id="icg-cost-panel"
              role="tabpanel"
              aria-labelledby={`icg-cost-panel-tab-${tab}`}
            >
              {tab === "stack" && data.stack !== null ? (
                <>
                  <StatStrip
                    title="Standard cost stack"
                    sub="What a unit is carried at, and what that figure is made of."
                    stats={data.stack.stats}
                  />

                  <Panel decision>
                    <PanelHead
                      title="Does the stack account for the balance?"
                      sub="Extended over the units on the book, not multiplied out of the SKU master."
                    />
                    <div style={{ padding: "14px 18px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            fontSize: "13px",
                            color: data.stack.agreement.agrees
                              ? "var(--aurora)"
                              : "var(--ember)",
                          }}
                        >
                          {data.stack.agreement.agrees ? "✓" : "✕"}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>
                          {data.stack.agreement.headline}
                        </span>
                      </div>
                      <p
                        className="icg-soft"
                        style={{ fontSize: "11.5px", lineHeight: 1.6, margin: "8px 0 0" }}
                      >
                        {data.stack.agreement.detail}
                      </p>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.stack.note}
                      </span>
                    </div>
                  </Panel>

                  <Panel>
                    <PanelHead
                      title="Cost build-up by SKU"
                      sub="Each component of the standard, with the units on hand it is carried on."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">SKU</th>
                            <th scope="col">Product</th>
                            {data.stack.componentColumns.map((c) => (
                              <th scope="col" key={c}>
                                {c}
                              </th>
                            ))}
                            <th scope="col">Standard / unit</th>
                            <th scope="col">On hand</th>
                            <th scope="col">Carried</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.stack.rows.map((row) => (
                            <tr key={row.sku}>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "11px" }}>
                                  {row.sku}
                                </span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {row.description}
                                </span>
                                {row.disagreement !== null ? (
                                  <div
                                    style={{
                                      fontSize: "10.5px",
                                      color: "var(--ember)",
                                      lineHeight: 1.45,
                                      marginTop: "3px",
                                    }}
                                  >
                                    {row.disagreement}
                                  </div>
                                ) : null}
                              </td>
                              {row.cells.map((cell, i) => (
                                <td
                                  className="icg-num"
                                  key={data.stack?.componentColumns[i] ?? String(i)}
                                >
                                  {cell}
                                </td>
                              ))}
                              <td className="icg-num" style={{ fontWeight: 600 }}>
                                {row.standard}
                              </td>
                              <td className="icg-num">{row.onHandUnits}</td>
                              <td className="icg-num">{row.carried}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.stack.effectiveNote} Standard cost is the cost of bringing a unit to
                        its present location and condition. Where a component would be a cost of
                        something else — a development build, an idle line, a demonstration
                        shipment — it is on the Period Costs tab instead. The exported file carries
                        the rate source behind every component.
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "classification" && data.classification !== null ? (
                <>
                  <StatStrip
                    title="Cost behaviour"
                    sub="How the capitalized components move with volume, and what stayed out of inventory entirely."
                    stats={data.classification.stats}
                  />
                  <Panel>
                    <PanelHead title="Capitalized components, by behaviour" />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Component</th>
                            <th scope="col">Behaviour</th>
                            <th scope="col">In inventory</th>
                            <th scope="col">Share</th>
                            <th scope="col">Basis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.classification.components.map((c) => (
                            <tr key={c.component}>
                              <td>
                                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>
                                  {c.component}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="icg-nstag"
                                  style={{
                                    color:
                                      c.behavior === "Fixed" ? "var(--frost)" : undefined,
                                  }}
                                >
                                  {c.behavior}
                                </span>
                              </td>
                              <td className="icg-num">{c.amount}</td>
                              <td className="icg-num">{c.share}</td>
                              <td>
                                <span
                                  className="icg-soft"
                                  style={{ fontSize: "11px", lineHeight: 1.5 }}
                                >
                                  {c.basis}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.classification.note}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "period" && data.period !== null ? (
                <>
                  <StatStrip
                    title="Period costs"
                    sub="FY2026 costs taken to the income statement rather than into inventory, each with the basis for keeping it out."
                    stats={data.period.stats}
                  />

                  <Panel decision>
                    <PanelHead
                      title="Do any of these reach an inventory account?"
                      sub="Checked against the recorded general-ledger balances."
                    />
                    <div style={{ padding: "14px 18px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            fontSize: "13px",
                            color: data.period.containment.held
                              ? "var(--aurora)"
                              : "var(--ember)",
                          }}
                        >
                          {data.period.containment.held ? "✓" : "✕"}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>
                          {data.period.containment.headline}
                        </span>
                      </div>
                      <p
                        className="icg-soft"
                        style={{ fontSize: "11.5px", lineHeight: 1.6, margin: "8px 0 0" }}
                      >
                        {data.period.containment.detail}
                      </p>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.period.note}
                      </span>
                    </div>
                  </Panel>

                  <Panel>
                    <PanelHead title="Pools taken to the period" />
                    {data.period.rows.length === 0 ? (
                      <div style={{ padding: "18px 20px" }}>
                        <NoRecordsState note="No FY2026 cost pool was recorded outside inventory." />
                      </div>
                    ) : (
                      <div className="icg-table-wrap">
                        <table className="icg-table">
                          <thead>
                            <tr>
                              <th scope="col">Pool</th>
                              <th scope="col">Category</th>
                              <th scope="col">Department</th>
                              <th scope="col">GL account</th>
                              <th scope="col">Treatment</th>
                              <th scope="col">Amount</th>
                              <th scope="col">Basis for exclusion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.period.rows.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                                    {row.id}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: "11.5px" }}>{row.category}</span>
                                </td>
                                <td>
                                  <span className="icg-soft" style={{ fontSize: "11px" }}>
                                    {row.department}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.glAccount}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-nstag">{row.treatment}</span>
                                </td>
                                <td className="icg-num">{row.amount}</td>
                                <td>
                                  <span
                                    className="icg-soft"
                                    style={{ fontSize: "11px", lineHeight: 1.5 }}
                                  >
                                    {row.basis}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        By category:{" "}
                        {data.period.byCategory
                          .map((c) => `${c.category} ${c.amount}`)
                          .join(" · ")}
                        .
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "cogs" && data.cogs !== null ? (
                <>
                  <StatStrip
                    title="COGS state"
                    sub="Whether the cost of a sold unit has left the year-end book."
                    stats={data.cogs.stats}
                  />
                  <Panel>
                    <PanelHead
                      title="Inventory relief by sales order"
                      sub="One row per commercial chain the close reconstructed."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Sales order</th>
                            <th scope="col">Cost of sales</th>
                            <th scope="col">What the book shows</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.cogs.rows.map((row) => (
                            <tr
                              key={row.salesOrder}
                              data-selected={
                                row.exceptionId !== null && exceptionId === row.exceptionId
                              }
                            >
                              <td>
                                {row.exceptionId !== null ? (
                                  <button
                                    type="button"
                                    className="icg-row-btn"
                                    aria-label={`Open ${row.exceptionId} summary`}
                                    onClick={() => openException(row.exceptionId)}
                                  />
                                ) : null}
                                <span className="icg-mono" style={{ fontSize: "11px" }}>
                                  {row.salesOrder}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`icg-close-capsule${
                                    row.variant === "aurora"
                                      ? " icg-close-capsule--aurora"
                                      : row.variant === "quiet"
                                        ? " icg-close-capsule--quiet"
                                        : ""
                                  }`}
                                >
                                  <span aria-hidden style={{ fontSize: "9px" }}>
                                    {row.glyph}
                                  </span>
                                  {row.state}
                                  {row.exceptionId !== null ? (
                                    <span className="icg-mono" style={{ fontSize: "9px" }}>
                                      {row.exceptionId}
                                    </span>
                                  ) : null}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="icg-soft"
                                  style={{ fontSize: "11px", lineHeight: 1.5 }}
                                >
                                  {row.detail}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.cogs.basisNote} {data.cogs.note}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

