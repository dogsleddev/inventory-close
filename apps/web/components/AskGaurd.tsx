"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import type { AskResult } from "../lib/view-model";

/**
 * Ask Gaurd (stage 08) — the investigative drawer.
 *
 * Four designed states (design/06_audit-ai Part B): default with suggested
 * prompts and the can/cannot list, a material answer, an access-restricted
 * response, and AI-unavailable. The fourth is not an error path here: the
 * answer engine is deterministic, so "no provider" renders the same
 * structured answer with no prose — narration is the only thing ever lost.
 *
 * The drawer holds no accounting logic and formats nothing. Every figure
 * arrives pre-formatted from lib/server/ask-view.ts.
 */

const CAN = ["Explain", "Investigate", "Summarize", "Draft", "Navigate"];
const CANNOT = ["Decide", "Approve", "Post", "Close an exception", "Invent evidence", "Set a reserve"];

export interface AskState {
  readonly question: string;
  readonly result: AskResult;
}

export function AskGaurd({
  context,
  suggestions,
  scope,
  state,
  onState,
  askAction,
}: {
  context: string;
  suggestions: readonly string[];
  scope: { exceptionId?: string | undefined; serial?: string | undefined };
  /** Lifted so an answer survives the drawer being closed by arbitration. */
  state: AskState | null;
  onState: (next: AskState | null) => void;
  askAction: (
    question: string,
    scope: { exceptionId?: string; serial?: string },
  ) => Promise<AskResult>;
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (trimmed === "" || pending) return;
    setDraft("");
    startTransition(async () => {
      const result = await askAction(trimmed, {
        ...(scope.exceptionId !== undefined ? { exceptionId: scope.exceptionId } : {}),
        ...(scope.serial !== undefined ? { serial: scope.serial } : {}),
      });
      onState({ question: trimmed, result });
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    ask(draft);
  };

  const answer = state?.result.answer ?? null;
  const refusal = state?.result.refusal ?? null;

  return (
    <>
      <div className="icg-ask-context">
        <div className="icg-label icg-label--md">CONTEXT</div>
        <div style={{ fontSize: "11.5px", marginTop: "2px" }}>{context}</div>
      </div>

      <div className="icg-ask-scroll">
        {state === null ? (
          <>
            <div className="icg-label icg-label--md">SUGGESTED</div>
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                className="icg-ask-suggestion"
                disabled={pending}
                onClick={() => ask(q)}
              >
                {q}
              </button>
            ))}
            <div className="icg-ask-cando">
              <div>
                <div className="icg-label">CAN</div>
                <ul className="icg-ask-list">
                  {CAN.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="icg-label">CANNOT</div>
                <ul className="icg-ask-list icg-ask-list--no">
                  {CANNOT.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : null}

        {state !== null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            <div className="icg-ask-user">{state.question}</div>

            {/* Assistive tech hears the answer arrive. */}
            <div role="status" aria-live="polite" style={{ display: "contents" }}>
              {pending ? (
                <div className="icg-state">
                  <span className="icg-state-glyph" aria-hidden>
                    ⧖
                  </span>
                  <div className="icg-state-note">Reading the close…</div>
                </div>
              ) : null}

              {answer !== null && !pending ? (
                <div className="icg-ask-answer">
                  <div className="icg-ask-sec">
                    <div className="icg-label">STATUS</div>
                    <div className="icg-ask-status">{answer.status}</div>
                  </div>

                  {answer.narration !== null ? (
                    <p className="icg-ask-narration">{answer.narration}</p>
                  ) : null}

                  {answer.knownFacts.length > 0 ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">KNOWN FACTS</div>
                      <dl className="icg-ask-facts">
                        {answer.knownFacts.map((f, i) => (
                          <div key={`${f.label}-${i}`} className="icg-ask-fact">
                            <dt>{f.label}</dt>
                            <dd className="icg-num">{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  {answer.conflictingEvidence.length > 0 ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">CONFLICTING EVIDENCE</div>
                      {answer.conflictingEvidence.map((c) => (
                        <p key={c} className="icg-ask-body">
                          {c}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {/* The trust moment: what is absent, said plainly. */}
                  {answer.missingEvidence.length > 0 ? (
                    <div className="icg-ask-sec icg-ask-sec--missing">
                      <div className="icg-label" style={{ color: "var(--ember)" }}>
                        MISSING EVIDENCE
                      </div>
                      {answer.missingEvidence.map((m) => (
                        <p key={m} className="icg-ask-body">
                          <span aria-hidden style={{ marginRight: "6px" }}>
                            ○
                          </span>
                          {m}
                          <span className="icg-sr-only"> — missing, required</span>
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {answer.assertions.length > 0 ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">ASSERTIONS</div>
                      <div className="icg-ask-chips">
                        {answer.assertions.map((a) => (
                          <span key={a} className="icg-nstag">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {answer.exposure !== null ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">EXPOSURE</div>
                      <div className="icg-ask-exposure icg-num">{answer.exposure.value}</div>
                      <div className="icg-quiet" style={{ fontSize: "10.5px" }}>
                        {answer.exposure.label}
                      </div>
                    </div>
                  ) : null}

                  <div className="icg-ask-sec">
                    <div className="icg-label">MANAGEMENT CONCLUSION</div>
                    <p className="icg-ask-body">{answer.managementConclusion}</p>
                  </div>

                  <div className="icg-ask-sec">
                    <div className="icg-label">NEXT ACTION</div>
                    <p className="icg-ask-body">{answer.nextAction}</p>
                  </div>

                  {answer.citations.length > 0 ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">EVIDENCE</div>
                      <div className="icg-ask-chips">
                        {answer.citations.map((c, i) =>
                          /* A chip is a real link or an honest absence —
                             never a control that does nothing. */
                          c.missing ? (
                            <span key={`${c.label}-${i}`} className="icg-ask-cite icg-ask-cite--missing">
                              <span aria-hidden>○</span> {c.label}
                              <span className="icg-sr-only"> — missing, required</span>
                            </span>
                          ) : c.href !== null ? (
                            <Link key={`${c.label}-${i}`} className="icg-ask-cite" href={c.href}>
                              {c.label}
                            </Link>
                          ) : (
                            <span key={`${c.label}-${i}`} className="icg-ask-cite">
                              {c.label}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="icg-quiet icg-ask-prov">
                    {state.result.toolsUsed.length > 0 ? (
                      <>Answered from {state.result.toolsUsed.join(", ")}.</>
                    ) : null}{" "}
                    {state.result.versions.map((v) => `${v.k}: ${v.v}`).join(" · ")}
                  </div>
                </div>
              ) : null}

              {refusal !== null && !pending ? (
                <div className="icg-state">
                  <span
                    className={`icg-state-glyph${refusal.reason === "NOT_AUTHORIZED" ? " icg-state-glyph--solid" : ""}`}
                    aria-hidden
                  >
                    {refusal.reason === "NOT_AUTHORIZED" ? "✕" : "○"}
                  </span>
                  <div>
                    <div className="icg-state-title">{refusal.title}</div>
                    <div className="icg-state-note">{refusal.message}</div>
                    {refusal.stillVisible.map((s) => (
                      <div key={s} className="icg-state-note" style={{ marginTop: "6px" }}>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="icg-linkbtn"
              style={{ alignSelf: "flex-start" }}
              onClick={() => onState(null)}
            >
              Ask something else
            </button>
          </div>
        ) : null}
      </div>

      <div className="icg-ask-input">
        <form className="icg-ask-input-box" onSubmit={onSubmit}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about this close…"
            aria-label="Ask Gaurd about this close"
            autoComplete="off"
            disabled={pending}
          />
          <button
            type="submit"
            aria-label="Ask"
            disabled={pending || draft.trim() === ""}
            className="icg-ask-send"
          >
            →
          </button>
        </form>
        <div className="icg-ask-disclaimer">
          Investigation only, over authorized data. Chat input is not evidence; answers are
          not approval.
        </div>
      </div>
    </>
  );
}
