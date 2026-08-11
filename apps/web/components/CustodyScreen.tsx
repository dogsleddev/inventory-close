"use client";

import { useState } from "react";
import type { CustodyData, MeasuredClaimView, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
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
 * Custody & Disposition (COMPLETION_PLAN Stage E).
 *
 * Three populations a reader will merge unless the screen keeps them apart:
 * company-owned stock in someone else's hands, someone else's stock in the
 * company's hands, and stock that left the book altogether.
 *
 * Every decision panel here renders from a boolean the services layer
 * measured, and each has a branch that says the opposite. Nothing on this
 * screen asserts a separation it did not check.
 */
export function CustodyScreen({
  shell,
  data,
  initialTab,
  setRoleAction,
}: {
  shell: ShellData;
  data: CustodyData;
  /** `?tab=` deep link; an unknown value falls back to the custody tab. */
  initialTab?: string | undefined;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>(
    initialTab !== undefined && data.tabs.some((t) => t.key === initialTab)
      ? initialTab
      : "custody",
  );

  return (
    <AppShell
      shell={shell}
      section="Custody & Disposition"
      setRoleAction={setRoleAction}
      {...(data.headerNote !== null ? { headerNote: data.headerNote } : {})}
      // No exception drawer on this screen: none of these three populations
      // is a control result, and none of them raises an exception.
      drawerOpen={false}
      askSuggestions={[
        "Who is holding our inventory that we do not hold ourselves?",
        "Is any stock on our floor owned by somebody else?",
        "What did we dispose of this year, and what did we get back?",
      ]}
      askContext="FY2026 Inventory Close · Custody"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Custody &amp; Disposition</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date {data.asOf === "" ? "Dec. 31, 2026" : data.asOf}
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="custody"
              label="the custody populations"
              scopeNote="Book custody, the consignment holdings and the FY2026 dispositions together, not just this tab."
            />
          )}
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="custody data" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={data.tabs}
                active={tab}
                onSelect={setTab}
                label="Custody tabs"
                panelId="icg-cust-panel"
              />
            </Panel>

            <div
              id="icg-cust-panel"
              role="tabpanel"
              aria-labelledby={`icg-cust-panel-tab-${tab}`}
            >
              {tab === "custody" && data.custody !== null ? (
                <>
                  <StatStrip
                    title="Physical custody"
                    sub="Who is holding the units the company owns."
                    stats={data.custody.stats}
                  />
                  <ClaimPanel
                    title="Does the custody cut account for the whole listing?"
                    sub="Derived from where each unit is, never stored."
                    claim={data.custody.coverage}
                    foot={data.custody.note}
                  />
                  <Panel>
                    <PanelHead
                      title="Book units by custody"
                      sub="Every unit here is company-owned, wherever it physically sits."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Custody</th>
                            <th scope="col">Held by</th>
                            <th scope="col">Locations</th>
                            <th scope="col">Named holder</th>
                            <th scope="col">Units</th>
                            <th scope="col">Carrying value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.custody.rows.map((row) => (
                            <tr key={row.custody}>
                              <td>
                                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>
                                  {row.custody}
                                </span>
                              </td>
                              <td>
                                <span className="icg-nstag">
                                  {row.heldByCompany ? "The company" : "Another party"}
                                </span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {row.locations}
                                </span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {row.custodians}
                                </span>
                              </td>
                              <td className="icg-num">{row.units}</td>
                              <td className="icg-num">{row.carrying}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.custody.unpopulatedNote}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "consignment" && data.consignment !== null ? (
                <>
                  <StatStrip
                    title="Consignment in"
                    sub="Stock on the company's floor that the company does not own."
                    stats={data.consignment.stats}
                  />
                  <ClaimPanel
                    title="Is any of this inside the inventory balance?"
                    sub="Checked against the year-end listing and the subledger."
                    claim={data.consignment.separation}
                    foot={data.consignment.note}
                  />
                  <Panel>
                    <PanelHead
                      title="Units held on consignment"
                      sub="By owner and agreement, at the owner's stated value."
                    />
                    {data.consignment.withheldNote !== null ? (
                      <div className="icg-panel-foot">
                        <span className="icg-soft" style={{ fontSize: "11px" }}>
                          {data.consignment.withheldNote}
                        </span>
                      </div>
                    ) : null}
                    {data.consignment.rows.length === 0 ? (
                      <div style={{ padding: "18px 20px" }}>
                        <NoRecordsState note="No vendor-owned stock is recorded in the company's custody at the balance-sheet date." />
                      </div>
                    ) : (
                      <div className="icg-table-wrap">
                        <table className="icg-table">
                          <thead>
                            <tr>
                              <th scope="col">Serial</th>
                              <th scope="col">SKU</th>
                              <th scope="col">Owner</th>
                              <th scope="col">Agreement</th>
                              <th scope="col">Location</th>
                              <th scope="col">Bin</th>
                              <th scope="col">Received</th>
                              <th scope="col">Owner&apos;s stated value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.consignment.rows.map((row) => (
                              <tr key={row.serial}>
                                <td>
                                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                                    {row.serial}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                                    {row.sku}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: "11px" }}>{row.owner}</span>
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.agreement}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-soft" style={{ fontSize: "11px" }}>
                                    {row.location}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.bin}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: "11px" }}>{row.received}</span>
                                </td>
                                <td className="icg-num">{row.statedValue}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.consignment.countNote}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "disposition" && data.disposition !== null ? (
                <>
                  <StatStrip
                    title="Disposition"
                    sub="Units that left the book during FY2026, and what was realised on them."
                    stats={data.disposition.stats}
                  />
                  <ClaimPanel
                    title="Is any disposed unit still on the listing?"
                    sub="Checked against the year-end listing."
                    claim={data.disposition.removal}
                    foot={data.disposition.note}
                  />
                  <Panel>
                    <PanelHead
                      title="FY2026 dispositions"
                      sub="Each record with its authorisation, its stated support, and what that support resolves to."
                    />
                    {data.disposition.withheldNote !== null ? (
                      <div className="icg-panel-foot">
                        <span className="icg-soft" style={{ fontSize: "11px" }}>
                          {data.disposition.withheldNote}
                        </span>
                      </div>
                    ) : null}
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Record</th>
                            <th scope="col">Serial</th>
                            <th scope="col">Method</th>
                            <th scope="col">Disposed</th>
                            <th scope="col">Original cost</th>
                            <th scope="col">Recovered</th>
                            <th scope="col">Not recovered</th>
                            <th scope="col">Authorised by</th>
                            <th scope="col">Stated support</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.disposition.rows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "11px" }}>
                                  {row.id}
                                </span>
                              </td>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "11px" }}>
                                  {row.serial}
                                </span>
                              </td>
                              <td>
                                <span className="icg-nstag">{row.method}</span>
                                <div
                                  className="icg-soft"
                                  style={{ fontSize: "10.5px", lineHeight: 1.45, marginTop: "3px" }}
                                >
                                  {row.reason}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize: "11px" }}>{row.disposed}</span>
                              </td>
                              <td className="icg-num">{row.originalCost}</td>
                              <td className="icg-num">{row.proceeds}</td>
                              <td className="icg-num">{row.loss}</td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {row.authorizedBy}
                                </span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "10.5px", lineHeight: 1.45 }}>
                                  {row.adjustment}
                                  <br />
                                  {row.evidence}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.disposition.supportNote}
                      </span>
                    </div>
                  </Panel>

                  <Panel>
                    <PanelHead
                      title="By method"
                      sub="What was recovered differs sharply by how the unit left."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Method</th>
                            <th scope="col">Units</th>
                            <th scope="col">Original cost</th>
                            <th scope="col">Recovered</th>
                            <th scope="col">Not recovered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.disposition.byMethod.map((row) => (
                            <tr key={row.method}>
                              <td>
                                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>
                                  {row.method}
                                </span>
                              </td>
                              <td className="icg-num">{row.units}</td>
                              <td className="icg-num">{row.cost}</td>
                              <td className="icg-num">{row.proceeds}</td>
                              <td className="icg-num">{row.loss}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        What each disposal realised is a fact about that unit. It is not a recovery
                        rate for anything still on hand, and no figure here is applied to the units
                        on the year-end listing.
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

/** A decision panel whose glyph and sentence come from a measured boolean. */
function ClaimPanel({
  title,
  sub,
  claim,
  foot,
}: {
  title: string;
  sub: string;
  claim: MeasuredClaimView;
  foot: string;
}) {
  return (
    <Panel decision>
      <PanelHead title={title} sub={sub} />
      <div style={{ padding: "14px 18px" }}>
        <div
          style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}
        >
          <span
            aria-hidden
            style={{ fontSize: "13px", color: claim.holds ? "var(--aurora)" : "var(--ember)" }}
          >
            {claim.holds ? "✓" : "✕"}
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600 }}>{claim.headline}</span>
        </div>
        <p className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.6, margin: "8px 0 0" }}>
          {claim.detail}
        </p>
      </div>
      <div className="icg-panel-foot">
        <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
          {foot}
        </span>
      </div>
    </Panel>
  );
}
