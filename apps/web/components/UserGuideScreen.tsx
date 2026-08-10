"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { Panel, PanelHead } from "./kit";

/**
 * User Guide (stage 10). The rail badges this section START HERE, so it is
 * the one page a first-time viewer reads before touching anything else.
 *
 * Deliberately static and figure-free: every number in this product belongs
 * to a screen that reads it from @icg/services, and a guide that quoted
 * one would hold a stale copy the day the dataset changed. The guide names
 * WHERE each answer lives; the screens state the answers.
 */

const DEMO_STEPS: readonly { step: string; where: string; href: string; what: string }[] = [
  {
    step: "1",
    where: "Overview",
    href: "/",
    what: "The close at a glance: readiness, blockers, exposure, and the GL difference — with Preventing Sign-Off as the working list.",
  },
  {
    step: "2",
    where: "EXC-001",
    href: "/exceptions/EXC-001",
    what: "The signature cutoff exception, opened from the Overview's primary action.",
  },
  {
    step: "3",
    where: "Three-layer reality",
    href: "/exceptions/EXC-001",
    what: "NetSuite says warehouse inventory. Physical evidence says shipped, delivered, installed before year-end. Accounting evidence says the governing provision is missing.",
  },
  {
    step: "4",
    where: "Transaction chain",
    href: "/exceptions/EXC-001",
    what: "Component coverage of the commercial chain, with the missing contract drawn in ember dash. Completeness is a count, never a confidence score.",
  },
  {
    step: "5",
    where: "Ask Gaurd",
    href: "/exceptions/EXC-001",
    what: "Ask why the item is still open. The Missing Evidence block declines to infer the term — the assistant explains control results; it never creates them.",
  },
];

const SECONDARY: readonly { label: string; href: string; note: string }[] = [
  {
    label: "Financial Life of the Unit",
    href: "/inventory",
    note: "Search a serial, then read its whole chain of custody: buy side, inventory life, sell/deploy side, and the accounting each step did or did not produce.",
  },
  {
    label: "Reconciliation",
    href: "/reconciliation",
    note: "The financial bridge from subledger to GL, procurement three-way match, commercial chains, and per-serial integrity.",
  },
  {
    label: "Audit Package",
    href: "/audit-package",
    note: "The management-prepared PBC workspace, the package manifest, and Reproduce Close — rebuild the dataset from its seed and compare every structured output.",
  },
];

const BOUNDARIES: readonly { rule: string; note: string }[] = [
  {
    rule: "NetSuite is read-only",
    note: "Gaurd proposes and explains. It has no path that posts, edits, or relieves anything — the adapter exposes reads only.",
  },
  {
    rule: "AI explains; it never concludes",
    note: "Every figure, status and citation in an Ask Gaurd answer is read from the same services the screens use. No language model is bound, and the answer says so.",
  },
  {
    rule: "Missing evidence stays visible",
    note: "A required record that is absent renders as a gap, never as a clean cell — and never becomes a PASS.",
  },
  {
    rule: "Readiness is not audit assurance",
    note: "Close readiness and PBC readiness are management preparation measures. Nothing in this product records what an external auditor concluded.",
  },
];

export function UserGuideScreen({
  shell,
  setRoleAction,
}: {
  shell: ShellData;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  return (
    <AppShell
      shell={shell}
      section="User Guide"
      setRoleAction={setRoleAction}
      drawerOpen={false}
      askSuggestions={["What prevents sign-off?", "Does inventory tie to the GL?"]}
      askContext="FY2026 Inventory Close · User Guide"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">User Guide</h1>
            <div className="icg-page-context">
              The evidence layer between NetSuite inventory operations and the financial
              close · fully synthetic FY2026 demo
            </div>
          </div>
        </div>

        <Panel decision>
          <div style={{ padding: "14px 18px 16px" }}>
            <div className="icg-label icg-label--md">WHAT YOU ARE LOOKING AT</div>
            <p style={{ fontSize: "13px", lineHeight: 1.65, margin: "6px 0 0", maxWidth: "72ch" }}>
              KestrelGrid AI is a fictional company closing its FY2026 inventory. NetSuite
              stays the system of record; operational systems establish physical facts; Gaurd
              reconciles the two into accounting evidence and asks one question of every
              serialized unit: does the year-end accounting agree with what physically
              happened? Everything here — every company, serial, document and figure — is
              synthetic, generated from a recorded seed.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="The 60-second path"
            sub="One exception, followed from the close's front door to the reason it cannot be signed off."
          />
          <div style={{ padding: "0 18px 16px", display: "grid", gap: "7px" }}>
            {DEMO_STEPS.map((s) => (
              <div
                key={s.step}
                className="icg-subpanel icg-guide-row--step icg-guide-row"
                style={{ padding: "10px 13px" }}
              >
                <span className="icg-num icg-quiet" aria-hidden style={{ fontSize: "15px" }}>
                  {s.step}
                </span>
                <Link href={s.href} className="icg-row-id" style={{ fontSize: "12.5px" }}>
                  {s.where}
                </Link>
                <span className="icg-soft" style={{ fontSize: "12px", lineHeight: 1.55 }}>
                  {s.what}
                </span>
              </div>
            ))}
            <p className="icg-quiet" style={{ fontSize: "11px", lineHeight: 1.55, margin: "5px 0 0" }}>
              The close continues past the demo: the conclusion on step 5 stays Open because
              the evidence is genuinely not there. Nothing in this product will close it for
              you.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Worth a longer look"
            sub="The secondary paths, in the order a controller would walk them."
          />
          <div style={{ padding: "0 18px 16px", display: "grid", gap: "7px" }}>
            {SECONDARY.map((s) => (
              <div
                key={s.href}
                className="icg-subpanel icg-guide-row"
                style={{ padding: "10px 13px", "--icg-guide-label": "212px" } as CSSProperties}
              >
                <Link href={s.href} className="icg-row-id" style={{ fontSize: "12.5px" }}>
                  {s.label}
                </Link>
                <span className="icg-soft" style={{ fontSize: "12px", lineHeight: 1.55 }}>
                  {s.note}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Roles and the demo controls"
            sub="Switch who is asking; the services decide what each role may see."
          />
          <div style={{ padding: "0 18px 16px", display: "grid", gap: "10px" }}>
            <p style={{ fontSize: "12px", lineHeight: 1.6, margin: 0, maxWidth: "78ch" }}>
              The <strong>ROLE</strong> control in the header switches the acting demo user —
              Controller, preparer, auditor and the rest. Authorization happens inside the
              services on every read, so what changes is not a view preference but what the
              product will answer: an auditor sees provided support only, restricted contract
              content stays withheld, and a section emptied by scope says so instead of
              rendering empty.
            </p>
            <p style={{ fontSize: "12px", lineHeight: 1.6, margin: 0, maxWidth: "78ch" }}>
              <strong>Reset Demo</strong> (header, controlled roles only) rebuilds the whole
              workspace from the seed, the rules and the scenario events — the baseline is
              re-derived, never restored from a snapshot, and the append-only audit trail
              survives. <strong>Reproduce Close</strong> (Audit Package) does the same rebuild
              without touching the running workspace and compares every structured output,
              reporting MATCH or MISMATCH with what moved.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="What this product will not do"
            sub="The boundaries are the product. Each one is enforced in code and pinned by tests."
          />
          <div style={{ padding: "0 18px 16px", display: "grid", gap: "7px" }}>
            {BOUNDARIES.map((b) => (
              <div
                key={b.rule}
                className="icg-guide-row"
                style={
                  {
                    fontSize: "12px",
                    padding: "7px 0",
                    borderBottom: "1px solid var(--hair)",
                    "--icg-guide-label": "232px",
                  } as CSSProperties
                }
              >
                <span style={{ fontWeight: 600 }}>{b.rule}</span>
                <span className="icg-soft" style={{ lineHeight: 1.55 }}>
                  {b.note}
                </span>
              </div>
            ))}
            <p className="icg-quiet" style={{ fontSize: "11px", lineHeight: 1.55, margin: "5px 0 0" }}>
              This is an independently created prototype. It is not a NetSuite product or
              replacement, it asserts no compliance with any audit standard, and audit
              readiness here never means audit approval.
            </p>
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
