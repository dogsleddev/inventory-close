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
  /** Null when the request itself failed — the AI-unavailable state. */
  readonly result: AskResult | null;
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
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (trimmed === "" || pending) return;
    setDraft("");
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await askAction(trimmed, {
          ...(scope.exceptionId !== undefined ? { exceptionId: scope.exceptionId } : {}),
          ...(scope.serial !== undefined ? { serial: scope.serial } : {}),
        });
        onState({ question: trimmed, result });
      } catch {
        // "AI failure does not break the close" (docs/09). An unhandled
        // rejection here would unmount the whole close screen — the one
        // outcome this product must never have. The designed
        // AI-unavailable state renders instead, and the deterministic
        // screens behind the drawer are untouched.
        onState({ question: trimmed, result: null });
        setFailed(true);
      }
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    ask(draft);
  };

  const answer = state?.result?.answer ?? null;
  const refusal = state?.result?.refusal ?? null;
  const toolsUsed = state?.result?.toolsUsed ?? [];
  const versions = state?.result?.versions ?? [];
  const aiStatus = state?.result?.aiStatus ?? null;

  return (
    <>
      <div className="icg-ask-context">
        <div className="icg-label icg-label--md">CONTEXT</div>
        <div style={{ fontSize: "11.5px", marginTop: "2px" }}>{context}</div>
      </div>

      <div className="icg-ask-scroll">
        {/* Mounted for the whole life of the drawer so assistive tech has a
            region to observe before the first answer lands. */}
        {/* The restriction count is announced BESIDE the missing count, never
            folded into it — two categories, two numbers.

            Moving scope restrictions out of `missingEvidence` was right, and
            it left this region announcing a clean "0 required items of
            evidence reported missing" on exactly the answers that withhold
            something. The wrong non-zero became a wrong zero: an assistive-tech
            reader heard nothing at all about a WITHHELD AT YOUR ACCESS SCOPE
            block sitting in the visible drawer. An absence must be stated
            rather than implied, and that applies to the announcement too. */}
        <div role="status" aria-live="polite" className="icg-sr-only">
          {pending
            ? "Reading the close."
            : state === null
              ? ""
              : state.result?.answer != null
                ? `Answer ready. ${state.result.answer.missingEvidence.length} required item${state.result.answer.missingEvidence.length === 1 ? "" : "s"} of evidence reported missing.${
                    state.result.answer.scopeNotes.length > 0
                      ? ` ${state.result.answer.scopeNotes.length} note${state.result.answer.scopeNotes.length === 1 ? "" : "s"} on what is withheld at your access scope.`
                      : ""
                  }`
                : state.result?.refusal != null
                  ? `Ask Gaurd declined: ${state.result.refusal.reason}.`
                  : "Ask Gaurd is unavailable. Deterministic close data remains available."}
        </div>
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

            {/* The live region must exist BEFORE its content so a change is
                announced; inserting region and content in one commit is not
                reliably read. It is always mounted (see the wrapper above). */}
            <div>
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

                  {/* Records that EXIST and this reader may not read.
                      Deliberately not the block above: no ember, no "○", no
                      " — missing, required", and not in the live region's
                      count. An auditor was reading "1 source document is
                      outside your access scope" under a heading saying MISSING
                      EVIDENCE, and every one of those five signals said
                      "missing" independently of the words. */}
                  {answer.scopeNotes.length > 0 ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">WITHHELD AT YOUR ACCESS SCOPE</div>
                      {answer.scopeNotes.map((m) => (
                        <p key={m} className="icg-ask-body">
                          {m}
                          <span className="icg-sr-only"> — restricted, not missing</span>
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {/* Draft mode. The drawer has advertised this capability
                      since stage 08 with nothing behind it; what it produces
                      is wording, and the figures it refers to are on the
                      Close Memo screen, which seals them with the version. */}
                  {answer.draft.length > 0 ? (
                    <div className="icg-ask-sec">
                      <div className="icg-label">SUGGESTED WORDING</div>
                      {answer.draft.map((d) => (
                        <div key={d.heading} style={{ marginTop: "7px" }}>
                          <div className="icg-ask-status" style={{ fontSize: "11.5px" }}>
                            {d.heading}
                          </div>
                          <p className="icg-ask-body">{d.body}</p>
                        </div>
                      ))}
                      <p className="icg-quiet" style={{ fontSize: "10.5px", lineHeight: 1.5 }}>
                        Wording only. Every figure a close memo states belongs to the Close
                        Memo screen, which supplies it from the close and seals it with the
                        version.
                      </p>
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

                  {aiStatus !== null ? (
                    <div className="icg-ask-aistate">
                      <span className="icg-label">
                        {aiStatus.providerBound
                          ? aiStatus.narrationAvailable
                            ? "AI NARRATION ATTACHED"
                            : "AI NARRATION WITHHELD"
                          : "AI OFF — DETERMINISTIC ANSWER"}
                      </span>
                      <span style={{ fontSize: "10.5px", lineHeight: 1.5 }}>
                        {aiStatus.note}
                      </span>
                    </div>
                  ) : null}

                  <div className="icg-quiet icg-ask-prov">
                    {toolsUsed.length > 0 ? <>Answered from {toolsUsed.join(", ")}.</> : null}{" "}
                    {versions.map((v) => `${v.k}: ${v.v}`).join(" · ")}
                  </div>
                </div>
              ) : null}

              {/* AI unavailable: narration is all that is lost. The close's
                  own figures are on the screen behind this drawer. */}
              {failed && !pending ? (
                <div className="icg-state">
                  <span
                    className="icg-state-glyph icg-state-glyph--solid"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
                    aria-hidden
                  >
                    G
                  </span>
                  <div>
                    <div className="icg-state-title">
                      Ask Gaurd unavailable
                    </div>
                    <div className="icg-state-note">
                      The assistant could not be reached. Deterministic close data remains
                      available — every figure it would have quoted is on the screen behind
                      this drawer, and close work is unaffected.
                    </div>
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
