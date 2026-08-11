"use client";

import { useState } from "react";
import type { MethodologyData, ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import {
  ClaimPanel,
  ExportCsvLink,
  FactRows,
  Panel,
  PanelHead,
  RestrictedState,
  StatStrip,
  TabBar,
} from "./kit";

/**
 * Methodology & Calculations (COMPLETION_PLAN Stage F, decision D12).
 *
 * Every other screen answers a question about the close. This one answers a
 * question about the product: where does each figure come from, and which
 * parts of it did somebody decide?
 *
 * The firewall that applies here applies nowhere else as strongly — there is
 * not a single figure in this file. Everything renders from
 * `buildMethodologyData`, which reads the same `explainReadiness` arithmetic
 * the close performed. A number transcribed onto the page that explains the
 * numbers would be the worst possible place for one.
 */
export function MethodologyScreen({
  shell,
  data,
  initialTab,
  setRoleAction,
}: {
  shell: ShellData;
  data: MethodologyData;
  /** `?tab=` deep link; an unknown value falls back to the readiness tab. */
  initialTab?: string | undefined;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>(
    initialTab !== undefined && data.tabs.some((t) => t.key === initialTab)
      ? initialTab
      : "readiness",
  );

  return (
    <AppShell
      shell={shell}
      section="Methodology"
      setRoleAction={setRoleAction}
      {...(data.headerNote !== null ? { headerNote: data.headerNote } : {})}
      drawerOpen={false}
      askSuggestions={[
        "Why is close readiness where it is?",
        "What explains the difference between the subledger and the ledger?",
        "Which parts of this product are judgements rather than derivations?",
      ]}
      askContext="FY2026 Inventory Close · Methodology"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Methodology &amp; Calculations</h1>
            <div className="icg-page-context">
              {data.restricted
                ? "FY2026"
                : `${data.policyVersion} · dataset ${data.datasetVersion} · run ${data.runId}`}
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="methodology"
              label="the derivations and assumptions"
              scopeNote="The readiness terms, the bridge steps, the accounting matrix and the whole register of authored judgements, not just this tab."
            />
          )}
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="the close methodology" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={data.tabs}
                active={tab}
                onSelect={setTab}
                label="Methodology tabs"
                panelId="icg-meth-panel"
              />
            </Panel>

            <div
              id="icg-meth-panel"
              role="tabpanel"
              aria-labelledby={`icg-meth-panel-tab-${tab}`}
            >
              {tab === "readiness" && data.readiness !== null ? (
                <>
                  <StatStrip
                    title="How close readiness is derived"
                    sub="Every category is scored from close state through the rule its own panel documents."
                    stats={data.readiness.stats}
                  />
                  {data.readiness.divergenceNote !== null ? (
                    <Panel decision>
                      <PanelHead
                        title="This is the live position, not the derived baseline"
                        sub="Somebody has acted on the close in this session."
                      />
                      <div style={{ padding: "14px 18px" }}>
                        <p
                          className="icg-soft"
                          style={{ fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}
                        >
                          {data.readiness.divergenceNote}
                        </p>
                      </div>
                    </Panel>
                  ) : null}
                  {data.readiness.categories.map((c) => (
                    <Panel key={c.key}>
                      <PanelHead
                        title={`${c.label} — ${c.score}`}
                        sub={`Weight ${c.weight} · contributes ${c.contribution} to the weighted sum`}
                      />
                      <div style={{ padding: "12px 18px 0" }}>
                        <p
                          className="icg-soft"
                          style={{ fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}
                        >
                          {c.basis}
                        </p>
                      </div>
                      <div className="icg-table-wrap">
                        <table className="icg-table">
                          <thead>
                            <tr>
                              <th scope="col">Term</th>
                              <th scope="col">What the close state was</th>
                              <th scope="col">Deduction</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.terms.map((t) => (
                              <tr key={t.rule}>
                                <td>
                                  <span style={{ fontSize: "11.5px" }}>{t.rule}</span>
                                </td>
                                <td>
                                  <span className="icg-soft" style={{ fontSize: "11px" }}>
                                    {t.observed}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className="icg-nstag"
                                    style={
                                      t.fired ? { color: "var(--ember-text)" } : undefined
                                    }
                                  >
                                    {t.penalty}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  ))}
                  <ClaimPanel
                    title="Does the last step divide into basis points?"
                    sub="The weights have to total 100 for it to."
                    claim={data.readiness.weightsSumTo100}
                    foot={data.readiness.roundingRule}
                  />
                  <Panel>
                    <PanelHead
                      title="The total"
                      sub="Every category's weight times its score, summed, then rounded."
                    />
                    <FactRows
                      rows={[
                        { k: "Weighted sum", v: data.readiness.weightedSum },
                        { k: "Close readiness", v: data.readiness.total },
                      ]}
                    />
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.readiness.note}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "bridge" && data.reconciliation !== null ? (
                <>
                  <StatStrip
                    title="Subledger to general ledger"
                    sub="The arithmetic behind the Reconciliation screen, step by step."
                    stats={data.reconciliation.stats}
                  />
                  <Panel>
                    <PanelHead
                      title="The steps"
                      sub="Each one checked against the figure above it."
                    />
                    <FactRows rows={data.reconciliation.steps} />
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.reconciliation.signConvention}
                      </span>
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHead
                      title="Identified reconciling items"
                      sub="Derived from the GL-side rule findings, never entered by hand."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Item</th>
                            <th scope="col">What it is</th>
                            <th scope="col">Exception</th>
                            <th scope="col">Effect on the ledger</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.reconciliation.items.map((i) => (
                            <tr key={i.id}>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "11px" }}>
                                  {i.id}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: "11.5px" }}>{i.description}</span>
                              </td>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "11px" }}>
                                  {i.exceptionId}
                                </span>
                              </td>
                              <td className="icg-num">{i.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <ClaimPanel
                    title="Do the identified items account for the whole difference?"
                    sub="Measured against the bridge, not asserted."
                    claim={data.reconciliation.explained}
                    foot={data.reconciliation.note}
                  />
                </>
              ) : null}

              {tab === "matrix" && data.matrix !== null ? (
                <>
                  <Panel>
                    <PanelHead
                      title="What each column answers, and on whose authority"
                      sub="Specified means the specification decides it. Authored means somebody here did."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Column</th>
                            <th scope="col">Question</th>
                            <th scope="col">Source</th>
                            <th scope="col">Basis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.matrix.dimensions.map((d) => (
                            <tr key={d.label}>
                              <td>
                                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>
                                  {d.label}
                                </span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {d.question}
                                </span>
                              </td>
                              <td>
                                <span className="icg-nstag">{d.provenance}</span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {d.basis}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <ClaimPanel
                    title="Are the units held where the table expects them to be?"
                    sub="Checked in both directions against the population."
                    claim={data.matrix.custodyExpectation}
                    foot={data.matrix.note}
                  />
                  {data.matrix.rows.map((row) => (
                    <Panel key={row.classification}>
                      <PanelHead
                        title={row.classification}
                        sub={`${row.glAccount} · ${row.units} units · ${row.carrying}`}
                      />
                      <FactRows
                        rows={[
                          { k: "Ownership assertion", v: row.ownership },
                          { k: "Expected custody", v: row.expectedCustody },
                          {
                            k: "Observed custody",
                            v:
                              row.custodyDifference === null
                                ? row.observedCustody
                                : `${row.observedCustody} — ${row.custodyDifference}`,
                          },
                          { k: "Cost relief", v: `${row.cogs} — ${row.cogsBasis}` },
                          { k: "Establishing record", v: row.record },
                        ]}
                      />
                    </Panel>
                  ))}
                </>
              ) : null}

              {tab === "interpretations" && data.interpretations !== null ? (
                <>
                  <Panel>
                    <PanelHead
                      title="Authored judgements"
                      sub="Read from the constant that holds each one, never restated beside it."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Question</th>
                            <th scope="col">About</th>
                            <th scope="col">The judgement</th>
                            <th scope="col">Basis</th>
                            <th scope="col">Held in</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.interpretations.rows.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <span style={{ fontSize: "11.5px" }}>{r.dimension}</span>
                              </td>
                              <td>
                                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>
                                  {r.subject}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: "11.5px" }}>{r.answer}</span>
                              </td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {r.basis}
                                </span>
                              </td>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "10.5px" }}>
                                  {r.heldIn}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.interpretations.note}
                      </span>
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHead
                      title="Policy values"
                      sub="Recorded in the close policy and hashed into the run. Changing one is a policy version change."
                    />
                    <div className="icg-table-wrap">
                      <table className="icg-table">
                        <thead>
                          <tr>
                            <th scope="col">Setting</th>
                            <th scope="col">Value</th>
                            <th scope="col">What it governs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.interpretations.policyValues.map((p) => (
                            <tr key={p.key}>
                              <td>
                                <span className="icg-mono" style={{ fontSize: "10.5px" }}>
                                  {p.key}
                                </span>
                              </td>
                              <td className="icg-num">{p.value}</td>
                              <td>
                                <span className="icg-soft" style={{ fontSize: "11px" }}>
                                  {p.governs}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel>
                    <PanelHead
                      title="What the reproducibility check does not cover"
                      sub="An equivalence check that does not say what it skipped invites the reader to assume it skipped nothing."
                    />
                    <div style={{ padding: "14px 18px" }}>
                      <ul
                        className="icg-soft"
                        style={{
                          fontSize: "11.5px",
                          lineHeight: 1.65,
                          margin: 0,
                          paddingLeft: "18px",
                        }}
                      >
                        {data.interpretations.replayExclusions.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
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
