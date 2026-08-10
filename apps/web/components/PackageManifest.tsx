"use client";

import { useState, useTransition } from "react";
import type { PackageManifestData, ReplayResultView } from "../lib/view-model";
import { Panel, PanelHead } from "./kit";

/**
 * Package manifest and Reproduce Close (stage 09, docs/10).
 *
 * The export package carries its manifest, version set, hashes, control
 * totals and synthetic disclosure — and the control that proves the totals
 * are reproducible rather than remembered. Reproduce Close rebuilds the
 * dataset from its seed, re-runs the rules and compares structured output;
 * what it does NOT compare is listed beside the result, because an
 * equivalence check that hides its exclusions reads as a stronger claim
 * than it is.
 */
export function PackageManifest({
  data,
  reproduceAction,
}: {
  data: PackageManifestData;
  reproduceAction: () => Promise<ReplayResultView>;
}) {
  const [result, setResult] = useState<ReplayResultView | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      setResult(await reproduceAction());
    });
  };

  return (
    <>
      <Panel>
        <PanelHead
          title="Package manifest"
          sub="Versions, hashes and control totals for this run — the provenance an export carries with it."
        />
        <div style={{ padding: "0 18px 16px" }}>
          <div className="icg-manifest">
            <div>
              <div className="icg-label" style={{ marginBottom: "6px" }}>
                RUN PROVENANCE
              </div>
              {data.manifest.map((row) => (
                <div key={row.k} className="icg-manifest-row">
                  <span className="icg-soft">{row.k}</span>
                  <span className="icg-mono" style={{ fontSize: "11px" }}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="icg-label" style={{ marginBottom: "6px" }}>
                CONTROL TOTALS
              </div>
              {data.controls.map((row) => (
                <div key={row.k} className="icg-manifest-row">
                  <span className="icg-soft">{row.k}</span>
                  <span className="icg-num" style={{ fontSize: "11.5px" }}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p
            className="icg-quiet"
            style={{ fontSize: "11px", lineHeight: 1.55, margin: "12px 0 0" }}
          >
            {data.disclosure}
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="Reproduce close"
          sub="Rebuild the dataset from its seed, re-run the rules, and compare the structured output."
          right={
            <button
              type="button"
              className="icg-btn icg-btn--mono"
              onClick={run}
              disabled={pending}
            >
              {pending ? "Reproducing…" : "Reproduce close"}
            </button>
          }
        />
        <div style={{ padding: "0 18px 16px" }}>
          {result === null ? (
            <p className="icg-soft" style={{ fontSize: "11.5px", margin: 0, lineHeight: 1.55 }}>
              Nothing has been reproduced in this session yet. The check compares{" "}
              {data.comparedSections.length} structured sections —{" "}
              <span className="icg-mono" style={{ fontSize: "10.5px" }}>
                {data.comparedSections.join(", ")}
              </span>
              . It never compares generated prose.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              <div className="icg-replay" role="status">
                <span
                  className={`icg-replay-outcome${
                    result.outcome === "MATCH"
                      ? " icg-replay-outcome--match"
                      : result.outcome === "MISMATCH"
                        ? " icg-replay-outcome--mismatch"
                        : ""
                  }`}
                >
                  {result.outcome}
                </span>
                <span style={{ fontSize: "12px" }}>{result.headline}</span>
              </div>
              {result.mismatchPaths.length > 0 ? (
                <div className="icg-subpanel" style={{ padding: "10px 13px" }}>
                  <div className="icg-label">SECTIONS THAT DIFFERED</div>
                  <div
                    className="icg-mono"
                    style={{ fontSize: "11px", marginTop: "4px", color: "var(--ember)" }}
                  >
                    {result.mismatchPaths.join(", ")}
                  </div>
                </div>
              ) : null}
              <div>
                {result.rows.map((row) => (
                  <div key={row.k} className="icg-manifest-row">
                    <span className="icg-soft">{row.k}</span>
                    <span style={{ fontSize: "11px" }}>{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.excluded.length > 0 ? (
            <p
              className="icg-quiet"
              style={{ fontSize: "10.5px", lineHeight: 1.5, margin: "11px 0 0" }}
            >
              Deliberately outside replay equivalence: {data.excluded.join("; ")}.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="What a change invalidates"
          sub="Each controlled-state slice and the workpapers prepared against it."
        />
        <div className="icg-table-wrap">
          <table className="icg-table">
            <thead>
              <tr>
                <th scope="col">Slice</th>
                <th scope="col">Kind</th>
                <th scope="col">Current state</th>
                <th scope="col">Workpapers</th>
              </tr>
            </thead>
            <tbody>
              {data.dependencies.map((row) => (
                <tr key={row.slice}>
                  <td className="icg-mono" style={{ fontSize: "11px" }}>
                    {row.slice}
                  </td>
                  <td className="icg-soft" style={{ fontSize: "11.5px" }}>
                    {row.kind}
                  </td>
                  <td className="icg-mono icg-soft" style={{ fontSize: "10.5px" }}>
                    {row.hash}
                  </td>
                  <td className="icg-mono" style={{ fontSize: "10.5px" }}>
                    {row.workpapers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          className="icg-quiet"
          style={{ fontSize: "11px", lineHeight: 1.55, padding: "11px 18px 15px", margin: 0 }}
        >
          {data.dependencyNote}
        </p>
      </Panel>
    </>
  );
}
