"use client";

import { useState, useTransition } from "react";
import type {
  CloseMemoData,
  ShellData,
  WorkflowActionResult,
} from "../lib/view-model";
import { AppShell } from "./AppShell";
import {
  ClaimPanel,
  ExportCsvLink,
  FactRows,
  NoRecordsState,
  Panel,
  PanelHead,
  RestrictedState,
  StatStrip,
  TabBar,
} from "./kit";

/**
 * The management close memo (COMPLETION_PLAN Stage F, decision D8).
 *
 * The first new command surface since the close loop, and it keeps that
 * pattern exactly: the actions are injected rather than imported, a refusal
 * is rendered as a stated reason in a live region, and a refused form stays
 * open with its input intact.
 *
 * The layout carries the argument. The editor holds prose and nothing else;
 * the close position sits beside it, read from the services layer on every
 * render. That is what makes the memo defensible without making it part of
 * the close — the figures are never copied into it, so they can never drift
 * from it.
 */
export function CloseMemoScreen({
  shell,
  data,
  initialTab,
  saveDraftAction,
  issueVersionAction,
  setRoleAction,
}: {
  shell: ShellData;
  data: CloseMemoData;
  /** `?tab=` deep link; an unknown value falls back to the memo tab. */
  initialTab?: string | undefined;
  /**
   * Injected rather than imported, as `ConclusionPanel` does it, so a test can
   * drive both outcomes with plain fakes — including the refusal, which is
   * the branch this screen most needs pinned.
   */
  saveDraftAction: (input: {
    title: string;
    body: string;
  }) => Promise<WorkflowActionResult>;
  issueVersionAction: (input: { note: string }) => Promise<WorkflowActionResult>;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<string>(
    initialTab !== undefined && data.tabs.some((t) => t.key === initialTab)
      ? initialTab
      : "memo",
  );
  const [title, setTitle] = useState(
    data.draft?.title ?? "FY2026 Inventory Close Memo",
  );
  const [body, setBody] = useState(data.draft?.body ?? "");
  const [issueNote, setIssueNote] = useState("");
  const [result, setResult] = useState<WorkflowActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<WorkflowActionResult>, onOk?: () => void) => {
    startTransition(async () => {
      const outcome = await fn();
      setResult(outcome);
      // A refusal leaves the editor exactly as it was: the user's words are
      // not what was wrong, and clearing them would make the refusal a loss.
      if (outcome.ok) onOk?.();
    });
  };

  return (
    <AppShell
      shell={shell}
      section="Close Memo"
      setRoleAction={setRoleAction}
      {...(data.headerNote !== null ? { headerNote: data.headerNote } : {})}
      drawerOpen={false}
      askSuggestions={[
        "What prevents sign-off?",
        "What explains the difference between the subledger and the ledger?",
        "What must management conclude before the period can close?",
      ]}
      askContext="FY2026 Inventory Close · Close Memo"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">Close Memo</h1>
            <div className="icg-page-context">
              FY2026 · balance-sheet date {data.asOf === "" ? "Dec. 31, 2026" : data.asOf}
            </div>
          </div>
          {data.restricted ? null : (
            <ExportCsvLink
              table="close-memo"
              label="the memo and its position"
              scopeNote="The issued text, the version history and the close position each version was sealed against."
            />
          )}
        </div>

        {data.restricted ? (
          <Panel>
            <div style={{ padding: "24px 20px" }}>
              <RestrictedState roleLabel={data.roleLabel} what="the close memo" />
            </div>
          </Panel>
        ) : (
          <>
            <Panel>
              <TabBar
                tabs={data.tabs}
                active={tab}
                onSelect={setTab}
                label="Close memo tabs"
                panelId="icg-memo-panel"
              />
            </Panel>

            <div
              id="icg-memo-panel"
              role="tabpanel"
              aria-labelledby={`icg-memo-panel-tab-${tab}`}
            >
              {tab === "memo" ? (
                <>
                  <StatStrip
                    title="The close this memo describes"
                    sub="Read from the close on every render. No figure below is typed into the memo."
                    stats={data.positionStats}
                  />

                  {data.positionMoved !== null ? (
                    <ClaimPanel
                      title="Does the issued version still describe this close?"
                      sub="Compared against the close-state hash sealed with it."
                      claim={data.positionMoved}
                      foot={data.notPartOfClose}
                    />
                  ) : (
                    <Panel decision>
                      <PanelHead
                        title="Nothing has been issued yet"
                        sub="There is no sealed version to compare the current position against."
                      />
                      <div style={{ padding: "14px 18px" }}>
                        <p
                          className="icg-soft"
                          style={{ fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}
                        >
                          {data.notPartOfClose}
                        </p>
                      </div>
                    </Panel>
                  )}

                  <Panel>
                    <PanelHead
                      title="Position as it stands"
                      sub="Every figure the memo speaks about, from the close that produced it."
                    />
                    <FactRows rows={data.position} />
                  </Panel>

                  {data.withheldNote !== null ? (
                    <Panel>
                      <div style={{ padding: "14px 18px" }}>
                        <p
                          className="icg-soft"
                          style={{ fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}
                        >
                          {data.withheldNote}
                        </p>
                      </div>
                    </Panel>
                  ) : null}

                  {data.issuedBody !== null ? (
                    <Panel>
                      <PanelHead
                        title="Issued memo"
                        sub="Sealed. It can be superseded by a new version, never edited."
                      />
                      <div style={{ padding: "14px 18px" }}>
                        <p
                          style={{
                            fontSize: "12.5px",
                            lineHeight: 1.7,
                            margin: 0,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {data.issuedBody}
                        </p>
                      </div>
                    </Panel>
                  ) : null}

                  {data.canDraft ? (
                    <Panel decision>
                      <PanelHead
                        title="Working draft"
                        sub={
                          data.draft !== null
                            ? `Last saved ${data.draft.at} by ${data.draft.by}.`
                            : body.trim() === ""
                              ? "Not started. Nothing outside this page reads a draft."
                              : // "Not started" would be a claim about the box
                                // as well as about the server, and after an
                                // issue the box still holds what was issued.
                                "Nothing saved. The text below is in this browser only — nothing outside this page reads it until you save."
                        }
                      />
                      <div style={{ padding: "14px 18px", display: "grid", gap: "10px" }}>
                        <label style={{ display: "grid", gap: "4px" }}>
                          <span className="icg-label">TITLE</span>
                          <input
                            type="text"
                            className="icg-input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "4px" }}>
                          <span className="icg-label">MEMO</span>
                          <textarea
                            className="icg-input"
                            rows={14}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Management's assessment of the FY2026 inventory close."
                          />
                        </label>
                        <div
                          className="icg-action-conclude"
                          style={{ gap: "7px", flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            className="icg-btn icg-btn--primary"
                            disabled={pending || title.trim() === "" || body.trim() === ""}
                            onClick={() => run(() => saveDraftAction({ title, body }))}
                          >
                            {pending ? "Saving…" : "Save draft"}
                          </button>
                          <button
                            type="button"
                            className="icg-linkbtn"
                            disabled={pending}
                            onClick={() => setBody(data.suggestedBody)}
                          >
                            Start from the close position
                          </button>
                        </div>
                        <p
                          className="icg-quiet"
                          style={{ fontSize: "10.5px", lineHeight: 1.5, margin: 0 }}
                        >
                          Starting from the close position fills the body with the
                          figures above and leaves the assessment blank. It is a
                          starting point, not a conclusion — this product never writes
                          one.
                        </p>
                      </div>
                    </Panel>
                  ) : (
                    <Panel>
                      <div style={{ padding: "18px 20px" }}>
                        <p
                          className="icg-soft"
                          style={{ fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}
                        >
                          Your demo role may read the memo but not draft it. Switch roles
                          in the header to see who prepares and who issues.
                        </p>
                      </div>
                    </Panel>
                  )}

                  {data.canIssue ? (
                    <Panel decision>
                      <PanelHead
                        title="Issue a version"
                        sub="Seals the text and a hash of the close position it was written against."
                      />
                      <div style={{ padding: "14px 18px", display: "grid", gap: "10px" }}>
                        <label style={{ display: "grid", gap: "4px" }}>
                          <span className="icg-label">NOTE FOR THE AUDIT TRAIL (OPTIONAL)</span>
                          <input
                            type="text"
                            className="icg-input"
                            value={issueNote}
                            onChange={(e) => setIssueNote(e.target.value)}
                          />
                        </label>
                        <div
                          className="icg-action-conclude"
                          style={{ gap: "7px", flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            className={
                              data.draft === null
                                ? "icg-btn icg-btn--disabled"
                                : "icg-btn icg-btn--primary"
                            }
                            disabled={pending || data.draft === null}
                            onClick={() =>
                              run(
                                () => issueVersionAction({ note: issueNote }),
                                () => setIssueNote(""),
                              )
                            }
                          >
                            {pending ? "Issuing…" : "Issue this version"}
                          </button>
                          <span className="icg-btn-reason">
                            {data.draft === null
                              ? "There is no working draft to issue."
                              : "An issued version is sealed and can only be superseded."}
                          </span>
                        </div>
                      </div>
                    </Panel>
                  ) : null}

                  {result !== null ? (
                    <div
                      role="status"
                      style={{
                        fontSize: "11.5px",
                        lineHeight: 1.55,
                        padding: "10px 18px",
                        color: result.ok ? "var(--aurora-text)" : "var(--ember-text)",
                      }}
                    >
                      {result.message}
                    </div>
                  ) : null}

                  <Panel>
                    <div className="icg-panel-foot">
                      <span className="icg-soft" style={{ fontSize: "11px", lineHeight: 1.55 }}>
                        {data.note}
                      </span>
                    </div>
                  </Panel>
                </>
              ) : null}

              {tab === "versions" ? (
                <Panel>
                  <PanelHead
                    title="Version history"
                    sub="Append-only. A version is superseded, never edited or removed."
                  />
                  <div style={{ display: "grid", gap: "7px", padding: "14px 18px" }}>
                    {data.withheldNote !== null ? (
                      <p
                        className="icg-soft"
                        style={{ fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}
                      >
                        {data.withheldNote}
                      </p>
                    ) : null}
                    {data.versions.length === 0 && data.withheldNote === null ? (
                      <NoRecordsState note="No version exists — the memo has not been drafted." />
                    ) : null}
                    {data.versions.map((v) => (
                      <div
                        key={v.key}
                        className={`icg-version${v.sealed ? " icg-version--sealed" : " icg-version--draft"}`}
                      >
                        <div style={{ display: "grid", gap: "2px" }}>
                          <div style={{ fontSize: "12.5px", fontWeight: 600 }}>
                            <span aria-hidden style={{ marginRight: "6px", fontSize: "9px" }}>
                              {v.glyph}
                            </span>
                            {v.label}
                            <span className="icg-quiet" style={{ fontWeight: 400 }}>
                              {" · "}
                              {v.date}
                            </span>
                          </div>
                          <div className="icg-soft" style={{ fontSize: "11.5px" }}>
                            {v.title}
                          </div>
                          <div className="icg-quiet" style={{ fontSize: "10.5px" }}>
                            {v.by}
                            {v.hash !== null ? (
                              <span className="icg-mono">{` · ${v.hash}`}</span>
                            ) : null}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span className="icg-nstag">{v.state}</span>
                          <span className="icg-lock">{v.lock}</span>
                        </div>
                      </div>
                    ))}
                    <p
                      className="icg-quiet"
                      style={{ fontSize: "10.5px", lineHeight: 1.5, margin: "4px 0 0" }}
                    >
                      An issued version is sealed with a hash of its text and a hash of
                      the close position it was written against. The working draft is the
                      only editable object here.
                    </p>
                  </div>
                </Panel>
              ) : null}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
