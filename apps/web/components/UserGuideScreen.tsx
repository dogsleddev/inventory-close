"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";
import { Panel, PanelHead } from "./kit";

/**
 * How to Explore This Demo — the START HERE page.
 *
 * Three guided journeys, each a real sequence of links a reader can follow,
 * then the boundaries, then the words. It is deliberately not a manual: the
 * screens explain themselves, and this page's job is to get a first-time
 * reader to the three places where the product's argument is visible.
 *
 * Deliberately figure-free. Every number in this product belongs to a screen
 * that reads it from @icg/services; a guide that quoted one would hold a
 * stale copy the day the dataset changed.
 */

interface Step {
  readonly step: string;
  readonly where: string;
  readonly href: string;
  readonly what: string;
}

interface Journey {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly steps: readonly Step[];
  readonly ending: string;
}

const JOURNEYS: readonly Journey[] = [
  {
    id: "signoff",
    question: "Why can’t the Controller sign off?",
    answer:
      "The close's front door, then the single item that best explains why it is still open. This is the sixty-second path.",
    steps: [
      {
        step: "1",
        where: "Overview",
        href: "/",
        what: "Blockers and exposure first: what is preventing sign-off, ordered by how much is at stake. Readiness is there too, as a management measure — not as assurance.",
      },
      {
        step: "2",
        where: "Preventing Sign-Off → EXC-001",
        href: "/exceptions/EXC-001",
        what: "The signature cutoff exception, opened from the working list. NetSuite says warehouse; the operational systems say shipped, delivered, installed before year-end.",
      },
      {
        step: "3",
        where: "Ask Gaurd → “Why is this still open?”",
        href: "/exceptions/EXC-001",
        what: "Open the assistant from the header. The Missing Evidence block declines to infer the contract term — it explains the control result, it never creates one.",
      },
    ],
    ending:
      "The conclusion stays Open because the evidence is genuinely not there. Nothing in this product will close it for you.",
  },
  {
    id: "unit",
    question: "What is the complete financial life of a physical unit?",
    answer:
      "One serial, followed from the purchase order that bought it to the accounting each step did — or did not — produce.",
    steps: [
      {
        step: "1",
        where: "Inventory → search KE-E2-1048",
        href: "/inventory?q=KE-E2-1048",
        what: "The search covers the book listing, count sheets, NetSuite transactions, carrier events, assignments, RMA records and telemetry — so a unit that is off the book is still discoverable.",
      },
      {
        step: "2",
        where: "Financial Life of the unit",
        href: "/inventory/KE-E2-1048",
        what: "Buy side, inventory life, sell/deploy side, accounting position. Missing events stay visibly missing rather than closing the gap for the reader.",
      },
      {
        step: "3",
        where: "Physical Count",
        href: "/physical-count",
        what: "Where the year-end count and the cycle-count history sit, including the counts an external auditor selected and the movements authorized during the count.",
      },
    ],
    ending:
      "A unit's story is assembled from the systems that recorded it. Where two systems disagree, both statements are kept and the disagreement is the finding.",
  },
  {
    id: "agree",
    question: "Does NetSuite agree with the physical and accounting evidence?",
    answer:
      "The same question at portfolio scale: the subledger against the general ledger, the chains behind the exceptions, and the evidence index underneath both.",
    steps: [
      {
        step: "1",
        where: "Reconciliation",
        href: "/reconciliation",
        what: "The inventory subledger-to-GL bridge: what is posted now, what is identified as reconciling, and what the pro-forma position would be if every identified item were approved.",
      },
      {
        step: "2",
        where: "Transaction chain on EXC-001",
        href: "/exceptions/EXC-001",
        what: "Component coverage of the commercial chain, with the missing contract drawn in ember. Completeness is a count of components, never a confidence score.",
      },
      {
        step: "3",
        where: "Evidence",
        href: "/evidence",
        what: "The index of records themselves — source, retrieval time, hash, and what each record supports, corroborates, conflicts with or is required for. Requirements with no record behind them are listed separately.",
      },
    ],
    ending:
      "Agreement is demonstrated record by record. Where a required record does not exist, the product says so instead of scoring around it.",
  },
];

const DOES: readonly { rule: string; note: string }[] = [
  {
    rule: "Assembles the evidence",
    note: "Reads NetSuite, warehouse, carrier, installation, telemetry, contract and forecast records, and puts the ones that bear on a year-end question in front of the person who has to answer it.",
  },
  {
    rule: "Runs deterministic controls",
    note: "Versioned rules produce the same result from the same inputs, every time. Each result names its rule, its version and the run that produced it.",
  },
  {
    rule: "Keeps the disagreements",
    note: "When two sourced facts cannot both be true, both are kept and the conflict is the finding. Nothing is quietly reconciled.",
  },
  {
    rule: "Prepares the audit package",
    note: "Management-prepared workpapers, versioned and sealed when provided, with a manifest and a replay that rebuilds the close from its seed.",
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
  {
    rule: "Revenue recognition is out of scope",
    note: "Sales orders, invoices, deliveries and installations are used as evidence for inventory cutoff and ownership. Gaurd does not determine revenue.",
  },
];

const TERMS: readonly { term: string; meaning: string }[] = [
  {
    term: "Blocker",
    meaning:
      "An open exception that management must conclude before the period can be signed off. Every blocker is an exception; not every exception is a blocker.",
  },
  {
    term: "Exposure",
    meaning:
      "The carrying value of the units an exception covers. It is what is at stake in the question, not a proposed adjustment and not a loss.",
  },
  {
    term: "Cutoff",
    meaning:
      "Whether a transaction landed in the right period. Goods that shipped before year-end but were relieved after it — or the reverse — are cutoff questions.",
  },
  {
    term: "Ownership / rights and obligations",
    meaning:
      "Whether the company owned the inventory at the balance-sheet date. Location does not establish it; custody does not establish it; an invoice does not establish it.",
  },
  {
    term: "GIT (goods in transit)",
    meaning: "Inventory that has left one party and not yet been received by the other at period end.",
  },
  {
    term: "Three-way match",
    meaning:
      "Purchase order against item receipt against vendor bill. A native match can pass while the year-end cutoff or ownership question is still open — they answer different questions.",
  },
  {
    term: "E&O (excess and obsolete)",
    meaning:
      "Stock unlikely to be consumed at its carrying value. The rules identify a review population; the reserve is management's conclusion and stays undetermined until they make it.",
  },
  {
    term: "PBC (prepared by client)",
    meaning:
      "The schedules an audit team asks management to prepare. Ready means prepared and internally reviewed; Provided means handed over and sealed. Neither means accepted.",
  },
  {
    term: "Reconciling item",
    meaning:
      "A known, explained difference between the subledger and the general ledger. Identified is not drafted, and drafted is not posted.",
  },
  {
    term: "Basis points (bps)",
    meaning: "Hundredths of a percent, used where a percentage needs to be exact rather than rounded.",
  },
  {
    term: "Coverage",
    meaning:
      "Whether a rule could read every input in its scope. It is separate from whether the accounting evidence is complete, and separate again from whether management has concluded.",
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
      section="How to Explore"
      setRoleAction={setRoleAction}
      drawerOpen={false}
      askSuggestions={["What prevents sign-off?", "Does inventory tie to the GL?"]}
      askContext="FY2026 Inventory Close · How to explore"
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">How to explore this demo</h1>
            <div className="icg-page-context">
              Three questions, each a short path through the product · fully synthetic FY2026
              dataset
            </div>
          </div>
        </div>

        <Panel decision>
          <div style={{ padding: "14px 18px 16px" }}>
            <div className="icg-label icg-label--md">WHAT YOU ARE LOOKING AT</div>
            <p style={{ fontSize: "13px", lineHeight: 1.65, margin: "6px 0 0", maxWidth: "72ch" }}>
              KestrelGrid AI is a fictional company closing its FY2026 inventory. NetSuite stays
              the system of record; operational systems establish physical facts; Gaurd
              reconciles the two into accounting evidence and asks one question of every
              serialized unit: does the year-end accounting agree with what physically happened?
              Everything here — every company, serial, document and figure — is synthetic,
              generated from a recorded seed.
            </p>
            <p
              className="icg-soft"
              style={{ fontSize: "12px", lineHeight: 1.6, margin: "10px 0 0", maxWidth: "72ch" }}
            >
              If you have sixty seconds, walk the first journey below and stop at Ask Gaurd. If
              you have ten minutes, walk all three.
            </p>
          </div>
        </Panel>

        {JOURNEYS.map((journey, index) => (
          <Panel key={journey.id}>
            <PanelHead
              large
              title={journey.question}
              sub={journey.answer}
              right={
                <span className="icg-quiet" style={{ fontSize: "10.5px" }}>
                  JOURNEY {index + 1} OF {JOURNEYS.length}
                </span>
              }
            />
            <div style={{ padding: "0 18px 16px", display: "grid", gap: "7px" }}>
              {journey.steps.map((s) => (
                <div
                  key={`${journey.id}-${s.step}`}
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
                {journey.ending}
              </p>
            </div>
          </Panel>
        ))}

        <div
          className="icg-split"
          style={{ "--icg-split-cols": "1fr 1fr" } as CSSProperties}
        >
          <Panel>
            <PanelHead
              title="What this product does"
              sub="Four jobs, each visible on a screen you can open."
            />
            <div style={{ padding: "0 18px 16px", display: "grid", gap: "7px" }}>
              {DOES.map((b) => (
                <div
                  key={b.rule}
                  className="icg-guide-row"
                  style={
                    {
                      fontSize: "12px",
                      padding: "7px 0",
                      borderBottom: "1px solid var(--hair)",
                      "--icg-guide-label": "190px",
                    } as CSSProperties
                  }
                >
                  <span style={{ fontWeight: 600 }}>{b.rule}</span>
                  <span className="icg-soft" style={{ lineHeight: 1.55 }}>
                    {b.note}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="What it will not do"
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
                      "--icg-guide-label": "190px",
                    } as CSSProperties
                  }
                >
                  <span style={{ fontWeight: 600 }}>{b.rule}</span>
                  <span className="icg-soft" style={{ lineHeight: 1.55 }}>
                    {b.note}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

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
              rendering empty. Switch to <strong>Auditor (Read-Only)</strong> on the Audit
              Package or the Evidence index to see the difference.
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
            title="Key terms"
            sub="The words this product uses in their accounting sense, not their everyday one."
          />
          <div style={{ padding: "0 18px 16px", display: "grid", gap: "0" }}>
            {TERMS.map((t) => (
              <div
                key={t.term}
                className="icg-guide-row"
                style={
                  {
                    fontSize: "12px",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--hair)",
                    "--icg-guide-label": "212px",
                  } as CSSProperties
                }
              >
                <span style={{ fontWeight: 600 }}>{t.term}</span>
                <span className="icg-soft" style={{ lineHeight: 1.55 }}>
                  {t.meaning}
                </span>
              </div>
            ))}
            <p className="icg-quiet" style={{ fontSize: "11px", lineHeight: 1.55, margin: "10px 0 0" }}>
              This is an independently created prototype. It is not a NetSuite product or
              replacement, it asserts no compliance with any audit standard, and audit readiness
              here never means audit approval.
            </p>
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
