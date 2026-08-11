"use client";

import { useState, useTransition } from "react";
import type { ExceptionWorkflowView, WorkflowActionResult } from "../lib/view-model";

/**
 * The close loop, on the exception it belongs to (COMPLETION_PLAN Stage W).
 *
 * The product's argument is that software flags and a person concludes. That
 * argument was undermined by two buttons that did nothing; these are the
 * verbs made real.
 *
 * The rule the panel exists to make legible: while a required record is
 * missing, "resolved" is not on offer. Management may record that the item
 * remains open — that is a real conclusion and it is kept — but the way to
 * close the item is to produce the record. The gate is enforced in the
 * services; this surface explains it BEFORE a user meets a refusal, which is
 * the difference between a control and an obstacle.
 */
export function ConclusionPanel({
  workflow,
  actions,
}: {
  workflow: ExceptionWorkflowView;
  actions: {
    recordConclusion: (input: {
      exceptionId: string;
      conclusion: "RESOLVED_NO_ADJUSTMENT" | "RESOLVED_ADJUSTMENT_PROPOSED" | "REMAINS_OPEN";
      rationale: string;
    }) => Promise<WorkflowActionResult>;
    requestEvidence: (input: {
      exceptionId: string;
      requirement: string;
      askedOf: string;
    }) => Promise<WorkflowActionResult>;
    submitEvidence: (input: {
      exceptionId: string;
      requirement: string;
      title: string;
      note: string;
    }) => Promise<WorkflowActionResult>;
  };
}) {
  const [open, setOpen] = useState<"none" | "conclude" | "request" | "submit">("none");
  const [rationale, setRationale] = useState("");
  const [note, setNote] = useState("");
  const [conclusion, setConclusion] =
    useState<"RESOLVED_NO_ADJUSTMENT" | "RESOLVED_ADJUSTMENT_PROPOSED" | "REMAINS_OPEN">(
      workflow.canResolve ? "RESOLVED_NO_ADJUSTMENT" : "REMAINS_OPEN",
    );
  const [result, setResult] = useState<WorkflowActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const requirement = workflow.unmetRequirements[0] ?? "";
  const run = (fn: () => Promise<WorkflowActionResult>) => {
    startTransition(async () => {
      const outcome = await fn();
      setResult(outcome);
      if (outcome.ok) {
        setOpen("none");
        setRationale("");
        setNote("");
      }
    });
  };

  if (!workflow.canConclude && !workflow.canRequest && !workflow.canSubmit) {
    return (
      <div className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5 }}>
        Your demo role may read this item but not act on it. Switch roles in the header to see
        who records conclusions.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
      {workflow.conclusion !== null ? (
        <div className="icg-subpanel" style={{ padding: "9px 12px" }}>
          <div className="icg-label">MANAGEMENT CONCLUSION RECORDED</div>
          <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "2px" }}>
            {workflow.conclusionLabel}
          </div>
          <div className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.5, marginTop: "2px" }}>
            “{workflow.conclusion.rationale}”
          </div>
          <div className="icg-quiet" style={{ fontSize: "10px", marginTop: "3px" }}>
            {workflow.conclusionBy} · {workflow.conclusionAt} · recorded beside the rule result,
            never over it
          </div>
        </div>
      ) : null}

      {open === "none" ? (
        <div className="icg-action-conclude" style={{ gap: "7px" }}>
          {workflow.canConclude ? (
            <button
              type="button"
              className="icg-btn icg-btn--primary"
              onClick={() => setOpen("conclude")}
            >
              {workflow.conclusion !== null ? "Revise conclusion" : "Record conclusion"}
            </button>
          ) : null}
          {workflow.canRequest && requirement !== "" ? (
            <button
              type="button"
              className="icg-btn icg-btn--ghost"
              onClick={() => setOpen("request")}
            >
              Request evidence
            </button>
          ) : null}
          {workflow.canSubmit && requirement !== "" ? (
            <button
              type="button"
              className="icg-btn icg-btn--ghost"
              onClick={() => setOpen("submit")}
            >
              Submit support
            </button>
          ) : null}
        </div>
      ) : null}

      {open === "conclude" ? (
        <div className="icg-subpanel" style={{ padding: "10px 12px" }}>
          <div className="icg-label">RECORD A MANAGEMENT CONCLUSION</div>
          {!workflow.canResolve ? (
            /* Said before the refusal, not after it. */
            <div
              style={{
                fontSize: "11px",
                lineHeight: 1.5,
                color: "var(--ember)",
                margin: "5px 0 0",
              }}
            >
              Required evidence is still missing, so this item cannot be concluded resolved.
              Recording that it remains open is a conclusion in its own right; submitting the
              record is how it closes.
              <span style={{ display: "block", marginTop: "3px" }}>
                Still required: {workflow.unmetRequirements.join("; ")}
              </span>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "8px 0" }}>
            {(
              [
                ["RESOLVED_NO_ADJUSTMENT", "Resolved — no adjustment required"],
                ["RESOLVED_ADJUSTMENT_PROPOSED", "Resolved — an adjustment is proposed"],
                ["REMAINS_OPEN", "Remains open"],
              ] as const
            ).map(([value, label]) => {
              const disabled = value !== "REMAINS_OPEN" && !workflow.canResolve;
              return (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "7px",
                    fontSize: "11.5px",
                    color: disabled ? "var(--quiet)" : undefined,
                  }}
                >
                  <input
                    type="radio"
                    name="icg-conclusion"
                    value={value}
                    checked={conclusion === value}
                    disabled={disabled}
                    onChange={() => setConclusion(value)}
                  />
                  <span>
                    {label}
                    {disabled ? (
                      <span className="icg-quiet" style={{ display: "block", fontSize: "10px" }}>
                        Unavailable — required evidence is missing
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="icg-label" htmlFor="icg-rationale">
            RATIONALE
          </label>
          <textarea
            id="icg-rationale"
            className="icg-input"
            rows={2}
            value={rationale}
            placeholder="What you concluded and on what basis"
            onChange={(e) => setRationale(e.target.value)}
            style={{ width: "100%", marginTop: "3px" }}
          />
          <div style={{ display: "flex", gap: "7px", marginTop: "7px" }}>
            <button
              type="button"
              className="icg-btn icg-btn--primary"
              disabled={pending || rationale.trim() === ""}
              onClick={() =>
                run(() =>
                  actions.recordConclusion({
                    exceptionId: workflow.exceptionId,
                    conclusion,
                    rationale,
                  }),
                )
              }
            >
              {pending ? "Recording…" : "Record"}
            </button>
            <button type="button" className="icg-linkbtn" onClick={() => setOpen("none")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {open === "request" ? (
        <div className="icg-subpanel" style={{ padding: "10px 12px" }}>
          <div className="icg-label">REQUEST THE MISSING RECORD</div>
          <div className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.5, margin: "4px 0 7px" }}>
            {requirement} — asked of {workflow.owner}. A request is not evidence: the record stays
            missing until it arrives.
          </div>
          <div style={{ display: "flex", gap: "7px" }}>
            <button
              type="button"
              className="icg-btn icg-btn--primary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  actions.requestEvidence({
                    exceptionId: workflow.exceptionId,
                    requirement,
                    askedOf: workflow.owner,
                  }),
                )
              }
            >
              {pending ? "Requesting…" : "Send request"}
            </button>
            <button type="button" className="icg-linkbtn" onClick={() => setOpen("none")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {open === "submit" ? (
        <div className="icg-subpanel" style={{ padding: "10px 12px" }}>
          <div className="icg-label">SUBMIT THE SUPPORT</div>
          <div className="icg-soft" style={{ fontSize: "11.5px", lineHeight: 1.5, margin: "4px 0 6px" }}>
            Recorded against: {requirement}
          </div>
          <textarea
            id="icg-support-note"
            className="icg-input"
            rows={2}
            value={note}
            placeholder="What the record is and where it came from"
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: "7px", marginTop: "7px" }}>
            <button
              type="button"
              className="icg-btn icg-btn--primary"
              disabled={pending || note.trim() === ""}
              onClick={() =>
                run(() =>
                  actions.submitEvidence({
                    exceptionId: workflow.exceptionId,
                    requirement,
                    title: requirement,
                    note,
                  }),
                )
              }
            >
              {pending ? "Submitting…" : "Submit"}
            </button>
            <button type="button" className="icg-linkbtn" onClick={() => setOpen("none")}>
              Cancel
            </button>
          </div>
          <div className="icg-quiet" style={{ fontSize: "10px", lineHeight: 1.5, marginTop: "6px" }}>
            Submitted support is pending review and is recorded as a submission — it never
            becomes one of the source records the close derived from.
          </div>
        </div>
      ) : null}

      {result !== null ? (
        <div
          role="status"
          style={{
            fontSize: "11px",
            lineHeight: 1.5,
            color: result.ok ? "var(--aurora)" : "var(--ember)",
          }}
        >
          {result.message}
        </div>
      ) : null}

      {workflow.requests.length > 0 || workflow.submissions.length > 0 ? (
        <div className="icg-quiet" style={{ fontSize: "10px", lineHeight: 1.5 }}>
          {workflow.requests.length > 0
            ? `${workflow.requests.length} request${workflow.requests.length === 1 ? "" : "s"} recorded. `
            : ""}
          {workflow.submissions.length > 0
            ? `${workflow.submissions.length} submission${workflow.submissions.length === 1 ? "" : "s"} against requirements.`
            : ""}
        </div>
      ) : null}
    </div>
  );
}
