"use client";

import { useState } from "react";
import type { ProcurementCard, ProcurementData, ShellData } from "../lib/view-model";
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
 * Procurement (COMPLETION_PLAN Stage C) — the buy side of the close.
 *
 * Five populations a Controller has to be able to name at period end. The
 * three-way match came here from Reconciliation unchanged: the native
 * NetSuite state stays a muted mono tag, the close-control state stays the
 * coloured capsule, and neither is ever derived from the other.
 *
 * The load-bearing sentence on this screen is on the Goods in Transit tab.
 * Invoiced-not-received and inbound goods in transit are the SAME units from
 * two sides, so they are presented as one reconciliation with an explicit
 * agreement statement — never as two totals a reader might add.
 */
export function ProcurementScreen({
  shell,
  data,
  initialTab,
  setRoleAction,
}: {
  shell: ShellData;
  data: ProcurementData;
  /** `?tab=` deep link; an unknown value falls back to the match tab. */
  initialTab?: string | undefined;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>(
    initialTab !== undefined && data.tabs.some((t) => t.key === initialTab)
      ? initialTab
      : "match",
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
      section="Procurement"
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
        "What have we received but not been invoiced for?",
        "Which purchase orders were billed but not received at year-end?",
        "Why can a native match pass while the close stays open?",
      ]}
      askContext="FY2026 Inventory Close · Procurement"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Procurement</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date {data.asOf === "" ? "Dec. 31, 2026" : data.asOf}
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="procurement"
              label="the procurement populations"
              scopeNote="All five procurement populations, not just this tab."
            />
          )}
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="procurement data" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={data.tabs}
                active={tab}
                onSelect={setTab}
                label="Procurement tabs"
                panelId="icg-proc-panel"
              />
            </Panel>

            <div id="icg-proc-panel" role="tabpanel" aria-labelledby={`icg-proc-panel-tab-${tab}`}>
              {data.withheldNote !== null ? (
                <Panel>
                  <div className="icg-panel-foot">
                    <span className="icg-soft" style={{ fontSize: "11px" }}>
                      {data.withheldNote}
                    </span>
                  </div>
                </Panel>
              ) : null}

              {tab === "match" && data.match !== null ? (
                <>
                  <Panel>
                    <div
                      style={{
                        padding: "14px 18px",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "18px",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ maxWidth: "560px" }}>
                        <h2 className="icg-panel-title icg-panel-title--lg">
                          Purchase Order ↔ Item Receipt ↔ Vendor Bill
                        </h2>
                        <p
                          className="icg-soft"
                          style={{ fontSize: "11.5px", lineHeight: 1.55, margin: "5px 0 0" }}
                        >
                          A native three-way match asks <em>can this bill be paid</em>. The close
                          control asks <em>did we own this at the balance-sheet date</em>. The two
                          answer different questions and are reported separately throughout.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "18px" }}>
                        <div>
                          <div className="icg-label">NETSUITE 3WM PASS</div>
                          <div className="icg-num" style={{ fontSize: "16px", fontWeight: 600 }}>
                            {data.match.nativeSummary}
                          </div>
                        </div>
                        <div style={{ borderLeft: "1px solid var(--hair)", paddingLeft: "18px" }}>
                          <div className="icg-label">CLOSE CONTROL</div>
                          <div
                            className="icg-num"
                            style={{ fontSize: "16px", fontWeight: 600, color: "var(--ember)" }}
                          >
                            {data.match.closeSummary}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px" }}>
                        {data.match.divergentNote}
                      </span>
                    </div>
                  </Panel>

                  {data.match.featured.map((card) => (
                    <ProcurementCardView
                      key={card.key}
                      card={card}
                      openException={openException}
                    />
                  ))}

                  <Panel>
                    <PanelHead
                      title="All procurement matches"
                      sub="Native NetSuite status, close-control status, and where each order stood at the balance-sheet date."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Purchase order</th>
                            <th scope="col">Vendor</th>
                            <th scope="col">Item receipt</th>
                            <th scope="col">Vendor bill</th>
                            <th scope="col">At Dec. 31</th>
                            <th scope="col">Native NetSuite</th>
                            <th scope="col">Close control</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.match.rows.map((row) => (
                            <tr
                              key={row.po}
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
                                  {row.po}
                                </span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {row.vendor}
                                </span>
                              </td>
                              <td>
                                <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                  {row.ir}
                                </span>
                              </td>
                              <td>
                                <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                  {row.vb}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: "11px" }}>{row.position}</span>
                              </td>
                              <td>
                                <span className="icg-nstag">{row.native}</span>
                              </td>
                              <td>
                                <CloseCapsule close={row.close} exceptionId={row.exceptionId} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px" }}>
                        A native three-way-match issue is not automatically an accounting
                        exception; it escalates only when a period-end question is affected.
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "grni" && data.grni !== null ? (
                <>
                  <StatStrip
                    title="Received not invoiced"
                    sub="Goods received before the balance-sheet date for which no vendor bill had been recorded."
                    stats={data.grni.stats}
                  />
                  <Panel>
                    <PanelHead title="Orders awaiting a vendor bill" />
                    {data.grni.rows.length === 0 ? (
                      <div style={{ padding: "18px 20px" }}>
                        <NoRecordsState note="Every order received before the balance-sheet date carries a vendor bill dated on or before it." />
                      </div>
                    ) : (
                      <div className="icg-table-wrap">
                        <table className="icg-table">
                          <thead>
                            <tr>
                              <th scope="col">Purchase order</th>
                              <th scope="col">Vendor</th>
                              <th scope="col">Item receipt</th>
                              <th scope="col">Received</th>
                              <th scope="col">Units</th>
                              <th scope="col">Value received</th>
                              <th scope="col">Outstanding at Dec. 31</th>
                              <th scope="col">Bill since received</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.grni.rows.map((row) => (
                              <tr key={row.po}>
                                <td>
                                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                                    {row.po}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-soft" style={{ fontSize: "11px" }}>
                                    {row.vendor}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.receipt}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: "11px" }}>{row.receiptDate}</span>
                                </td>
                                <td className="icg-num">{row.quantity}</td>
                                <td className="icg-num">
                                  {row.value ?? (
                                    <span className="icg-quiet">Not stated</span>
                                  )}
                                </td>
                                <td>
                                  <span style={{ fontSize: "11px" }}>{row.age}</span>
                                </td>
                                <td>
                                  {row.billed === null ? (
                                    <span className="icg-quiet" style={{ fontSize: "11px" }}>
                                      Still not billed
                                    </span>
                                  ) : (
                                    <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                      {row.billed}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.grni.note}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "inr" && data.inr !== null ? (
                <>
                  <StatStrip
                    title="Invoiced not received"
                    sub="Vendor bills recorded on or before the balance-sheet date for goods whose item receipt was recorded after it."
                    stats={data.inr.stats}
                  />
                  <Panel>
                    <PanelHead title="Orders billed before the goods arrived" />
                    {data.inr.rows.length === 0 ? (
                      <div style={{ padding: "18px 20px" }}>
                        <NoRecordsState note="No vendor bill dated on or before the balance-sheet date is waiting on an item receipt." />
                      </div>
                    ) : (
                      <div className="icg-table-wrap">
                        <table className="icg-table">
                          <thead>
                            <tr>
                              <th scope="col">Purchase order</th>
                              <th scope="col">Vendor</th>
                              <th scope="col">Vendor bill</th>
                              <th scope="col">Billed</th>
                              <th scope="col">Units</th>
                              <th scope="col">Value billed</th>
                              <th scope="col">Receipt recorded</th>
                              <th scope="col">Close control</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.inr.rows.map((row) => (
                              <tr
                                key={row.po}
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
                                    {row.po}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-soft" style={{ fontSize: "11px" }}>
                                    {row.vendor}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.bill}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: "11px" }}>{row.billDate}</span>
                                </td>
                                <td className="icg-num">{row.quantity}</td>
                                <td className="icg-num">
                                  {row.value ?? <span className="icg-quiet">Not stated</span>}
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.received}
                                  </span>
                                </td>
                                <td>
                                  <CloseCapsule close={row.close} exceptionId={row.exceptionId} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.inr.note}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "git" && data.git !== null ? (
                <>
                  <StatStrip
                    title="Goods in transit"
                    sub="Inventory in motion at the balance-sheet date, from both the document side and the book side."
                    stats={data.git.stats}
                  />
                  <Panel decision>
                    <PanelHead
                      title="Documents against the book"
                      sub="The same inbound population, counted two ways."
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
                            color: data.git.agreement.agrees ? "var(--aurora)" : "var(--ember)",
                          }}
                        >
                          {data.git.agreement.agrees ? "✓" : "✕"}
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 600 }}>
                          {data.git.agreement.headline}
                        </span>
                      </div>
                      <p
                        className="icg-soft"
                        style={{ fontSize: "11.5px", lineHeight: 1.6, margin: "8px 0 0" }}
                      >
                        {data.git.agreement.detail}
                      </p>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.git.accountNote}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "ppv" && data.ppv !== null ? (
                <>
                  <StatStrip
                    title="Purchase price variance"
                    sub="Where the price a vendor billed differed from the price on the order."
                    stats={data.ppv.stats}
                  />
                  <Panel>
                    <PanelHead title="Lines billed at a price other than the one ordered" />
                    {data.ppv.rows.length === 0 ? (
                      <div style={{ padding: "18px 20px" }}>
                        <NoRecordsState note="Every vendor bill line matched the price on its purchase order." />
                      </div>
                    ) : (
                      <div className="icg-table-wrap">
                        <table className="icg-table">
                          <thead>
                            <tr>
                              <th scope="col">Purchase order</th>
                              <th scope="col">Vendor</th>
                              <th scope="col">Vendor bill</th>
                              <th scope="col">SKU</th>
                              <th scope="col">Units</th>
                              <th scope="col">Ordered / unit</th>
                              <th scope="col">Billed / unit</th>
                              <th scope="col">Variance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.ppv.rows.map((row) => (
                              <tr key={row.key}>
                                <td>
                                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                                    {row.po}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-soft" style={{ fontSize: "11px" }}>
                                    {row.vendor}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono icg-soft" style={{ fontSize: "11px" }}>
                                    {row.bill}
                                  </span>
                                </td>
                                <td>
                                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                                    {row.sku}
                                  </span>
                                </td>
                                <td className="icg-num">{row.quantity}</td>
                                <td className="icg-num">{row.ordered}</td>
                                <td className="icg-num">{row.billed}</td>
                                <td className="icg-num">
                                  <span
                                    style={{
                                      color: row.unfavorable ? "var(--ember)" : undefined,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {row.variance}
                                  </span>{" "}
                                  <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                                    {row.direction}
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
                        {data.ppv.treatment} {data.ppv.note}
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

/** The close-control capsule, with its exception id when one exists. */
function CloseCapsule({
  close,
  exceptionId,
}: {
  close: { label: string; glyph: string; variant: "frost" | "aurora" };
  exceptionId: string | null;
}) {
  return (
    <span
      className={`icg-close-capsule${close.variant === "aurora" ? " icg-close-capsule--aurora" : ""}`}
    >
      <span aria-hidden style={{ fontSize: "9px" }}>
        {close.glyph}
      </span>
      {close.label}
      {exceptionId !== null ? (
        <span className="icg-mono" style={{ fontSize: "9px" }}>
          {exceptionId}
        </span>
      ) : null}
    </span>
  );
}


function ProcurementCardView({
  card,
  openException,
}: {
  card: ProcurementCard;
  openException: (id: string | null) => void;
}) {
  return (
    <section className={`icg-proc-card${card.ember ? " icg-proc-card--ember" : ""}`}>
      <div className="icg-proc-head">
        <span className="icg-mono" style={{ fontSize: "11px", fontWeight: 600 }}>
          {card.po}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{card.title}</span>
        {card.qtyAmount !== null ? (
          <span className="icg-soft icg-num" style={{ fontSize: "11.5px" }}>
            {card.qtyAmount}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span className="icg-nstag">{card.nsTag}</span>
        {card.exceptionId !== null ? (
          <button
            type="button"
            className={`icg-close-capsule${card.close.variant === "aurora" ? " icg-close-capsule--aurora" : ""}`}
            onClick={() => openException(card.exceptionId)}
          >
            <span aria-hidden style={{ fontSize: "9px" }}>
              {card.close.glyph}
            </span>
            {card.close.label}
          </button>
        ) : (
          <span
            className={`icg-close-capsule${card.close.variant === "aurora" ? " icg-close-capsule--aurora" : ""}`}
          >
            <span aria-hidden style={{ fontSize: "9px" }}>
              {card.close.glyph}
            </span>
            {card.close.label}
          </span>
        )}
      </div>
      <div className="icg-proc-legs">
        {card.legs.map((leg) => (
          <div
            key={leg.label}
            className={`icg-proc-leg${leg.missing ? " icg-proc-leg--missing" : ""}`}
          >
            <span className="icg-proc-leg-label">
              <span aria-hidden style={{ fontSize: "9px" }}>
                {leg.glyph}
              </span>
              {leg.label}
            </span>
            <div className="icg-proc-leg-value">{leg.value}</div>
            <div className="icg-proc-leg-note">{leg.note}</div>
          </div>
        ))}
      </div>
      <div className="icg-proc-foot">
        <span
          aria-hidden
          style={{
            color: card.footnote.tone === "ember" ? "var(--ember)" : "var(--aurora)",
            fontSize: "11px",
          }}
        >
          {card.footnote.glyph}
        </span>
        <span>{card.footnote.text}</span>
      </div>
    </section>
  );
}
