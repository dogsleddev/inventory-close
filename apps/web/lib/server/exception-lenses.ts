import type { ExceptionView } from "@icg/services";
import { formatCents, formatDate, formatDateShort } from "../format";
import { conclusionLabel } from "../workflow-view";
import type { LensView } from "../view-model";
import type { ExceptionContext } from "./exception-view";
import { carrierFact, carrierPhrase } from "./exception-view";
import { capitalize, kindLabel, locationLabel, sourceLabel, sourceName } from "./humanize";

/**
 * Domain-aware evidence lenses.
 *
 * The three-layer reality (NetSuite says / Physical evidence says /
 * Accounting evidence says) is the CUTOFF and OWNERSHIP pattern — canonical
 * on EXC-001 per CANONICAL_SPEC §2 and design 03, and preserved here exactly.
 * It is not, however, the shape of every control: a count exception separates
 * the book from the count from the movement log, and a manual journal entry
 * has no physical dimension at all.
 *
 * Two rules govern every builder below:
 *
 *   1. A lens is OMITTED when the exception has nothing of that kind. The
 *      generic template used to fill it with "No operational evidence in
 *      scope", which reads as a finding about the evidence when it is only a
 *      finding about the template.
 *   2. Every lens states what a source SAYS, never what is therefore true.
 *      Location is not ownership; a count is not a conclusion; an unanswered
 *      confirmation is not a denial.
 *
 * Everything here is a projection of service output. No lens computes a
 * figure, a status, or a conclusion of its own.
 */

type Exception = ExceptionView["exception"];
type Finding = Exception["finding"];

export interface LensInput {
  readonly finding: Finding;
  readonly status: Exception["status"];
  readonly context: ExceptionContext;
  /** Balance-sheet date from the reconciliation, for before/after period reasoning. */
  readonly periodEnd: string | undefined;
  readonly staleNote: string | null;
}

type Evidence = ExceptionContext["evidence"][number];

const PHYSICAL_SOURCES = ["FLIGHTPATH", "DEPLOY_OPS", "DEVICE_CLOUD", "RETURN_LOOP"];

function content(e: Evidence | undefined): Record<string, unknown> | undefined {
  return e?.content;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function chipOf(e: Evidence, withKind = false): LensView["chips"][number] {
  return {
    src: e.sourceSystem !== undefined ? sourceLabel(e.sourceSystem) : "—",
    kind: withKind ? kindLabel(e.kind) : null,
    id: e.title,
    evidenceId: e.id,
    netsuite: e.sourceSystem === "NETSUITE_ERP" || e.sourceSystem === "NETSUITE_WMS",
  };
}

function lens(partial: Partial<LensView> & Pick<LensView, "key" | "label" | "headline">): LensView {
  return {
    sub: null,
    facts: [],
    chips: [],
    note: null,
    conflict: false,
    missingChip: null,
    staleNote: null,
    ...partial,
  };
}

/** The first required requirement with no record behind it. */
function firstUnmet(finding: Finding) {
  return finding.evidenceRequirements.find((r) => r.required && !r.satisfied);
}

function unmetAll(finding: Finding) {
  return finding.evidenceRequirements.filter((r) => r.required && !r.satisfied);
}

function missingChipFor(
  description: string,
  source: Evidence | undefined,
): LensView["missingChip"] {
  return {
    label: description,
    src: source?.sourceSystem !== undefined ? sourceLabel(source.sourceSystem) : "—",
    evidenceId: source?.id ?? null,
  };
}

/**
 * CNT-EX-001 — a serial on the book that the count did not find.
 * Book / Count / Movement: three sources that cannot all be right.
 */
function countExistenceLenses(input: LensInput): LensView[] {
  const { finding, context } = input;
  const serial = finding.subjects.serials?.[0];
  const unit = context.bookUnits[0];
  const countEvidence = context.evidence.find((e) => e.kind === "COUNT_RESULT");
  const c = content(countEvidence);
  const snapshot = num(c?.["snapshotQuantity"]);
  const counted = num(c?.["countQuantity"]);
  const bin = str(c?.["bin"]);
  const out: LensView[] = [];

  out.push(
    lens({
      key: "book",
      label: "BOOK / NETSUITE",
      headline: serial !== undefined ? `${serial} on the year-end listing` : "On the year-end listing",
      sub:
        unit !== undefined
          ? `${locationLabel(unit.location)} · carried at ${formatCents(unit.unitCostCents)} · not relieved`
          : "Recorded on the book at the balance-sheet date.",
      facts:
        snapshot !== undefined
          ? [{ label: "BOOK QUANTITY", value: String(snapshot) }]
          : [],
      note: "ERP and WMS state. Read-only in this MVP — Gaurd never posts, edits or relieves inventory.",
    }),
  );

  if (countEvidence !== undefined) {
    out.push(
      lens({
        key: "count",
        label: "PHYSICAL COUNT",
        headline:
          counted !== undefined
            ? `${counted === 0 ? "Not found" : String(counted)} at first pass`
            : "First pass did not locate the unit",
        sub:
          bin !== undefined
            ? `Counted in ${bin} against the year-end snapshot.`
            : "Counted against the year-end snapshot.",
        facts: [
          ...(snapshot !== undefined ? [{ label: "SNAPSHOT", value: String(snapshot) }] : []),
          ...(counted !== undefined ? [{ label: "COUNTED", value: String(counted) }] : []),
          ...(snapshot !== undefined && counted !== undefined
            ? [{ label: "VARIANCE", value: String(counted - snapshot) }]
            : []),
        ],
        chips: [chipOf(countEvidence, true)],
        conflict: true,
      }),
    );
  }

  const noMovement = (finding.reasonCodes ?? []).includes("NO_MOVEMENT_RECORD");
  if (noMovement) {
    out.push(
      lens({
        key: "movement",
        label: "MOVEMENT EVIDENCE",
        headline: "No authorized movement explains the difference",
        // A checked negative, not an absence of checking: the movement log
        // was read and it does not cover this serial.
        sub: "The count-window movement log was checked; no authorized movement covers this serial.",
      }),
    );
  }

  const unmet = firstUnmet(finding);
  if (unmet !== undefined) {
    out.push(
      lens({
        key: "needed",
        label: "EVIDENCE NEEDED",
        headline: unmet.description,
        sub: `Required for the ${finding.ruleId} conclusion. Until it exists, the item stays open.`,
        missingChip: missingChipFor(unmet.description, undefined),
        conflict: true,
        staleNote: input.staleNote,
      }),
    );
  }
  return out;
}

/**
 * CNT-COMP-001 — a unit on the floor that the book does not carry.
 * The count leads, because the count is what found it.
 */
function countCompletenessLenses(input: LensInput): LensView[] {
  const { finding, context } = input;
  const serial = finding.subjects.serials?.[0];
  const testEvidence = context.evidence.find((e) => e.kind === "COUNT_TEST");
  const c = content(testEvidence);
  const location = str(c?.["location"]) ?? finding.subjects.locations?.[0];
  const bin = str(c?.["bin"]);
  const direction = str(c?.["direction"]);
  const out: LensView[] = [];

  out.push(
    lens({
      key: "count",
      label: "PHYSICAL COUNT",
      headline:
        serial !== undefined && location !== undefined
          ? `${serial} observed in ${locationLabel(location)}`
          : "Unit observed on the floor",
      sub: str(c?.["observation"]) ?? null,
      facts: [
        ...(direction !== undefined
          ? [{ label: "TEST", value: direction === "FLOOR_TO_SHEET" ? "Floor to sheet" : "Sheet to floor" }]
          : []),
        ...(bin !== undefined ? [{ label: "BIN", value: bin }] : []),
      ],
      chips: testEvidence !== undefined ? [chipOf(testEvidence, true)] : [],
    }),
  );

  out.push(
    lens({
      key: "book",
      label: "BOOK / NETSUITE",
      headline: "Serial absent from the year-end listing",
      sub: (finding.reasonCodes ?? []).includes("NO_AUTO_ADD")
        ? "A unit found on the floor is never auto-added to inventory. The absence is the finding, not a gap to be filled."
        : "The year-end listing does not carry this serial.",
      conflict: true,
    }),
  );

  const unmet = firstUnmet(finding);
  if (unmet !== undefined) {
    out.push(
      lens({
        key: "source-needed",
        label: "SOURCE EVIDENCE NEEDED",
        headline: unmet.description,
        sub: `Required for the ${finding.ruleId} conclusion: where the unit came from decides how it is accounted for.`,
        missingChip: missingChipFor(unmet.description, undefined),
        conflict: true,
        staleNote: input.staleNote,
      }),
    );
  }
  return out;
}

/**
 * VAL-EO-001 — the valuation lenses. The rule identifies a review
 * population; the reserve is management's and stays UNDETERMINED here.
 */
function valuationEoLenses(input: LensInput): LensView[] {
  const { finding, context } = input;
  const forecast = context.evidence.find((e) => e.kind === "FORECAST");
  const c = content(forecast);
  const horizon = num(c?.["horizonMonths"]);
  const units = num(c?.["forecastUnits"]);
  const note = str(c?.["note"]);
  const sku = finding.subjects.skus?.[0];
  const reasons = finding.reasonCodes ?? [];
  const out: LensView[] = [];

  if (reasons.includes("AGED_NO_MOVEMENT")) {
    out.push(
      lens({
        key: "history",
        label: "INVENTORY HISTORY",
        headline: "No movement for 365+ days",
        sub: sku !== undefined
          ? `${sku} stock aged past the policy threshold at the balance-sheet date.`
          : "Stock aged past the policy threshold at the balance-sheet date.",
      }),
    );
  }

  if (forecast !== undefined) {
    out.push(
      lens({
        key: "demand",
        label: "DEMAND EVIDENCE",
        headline:
          units !== undefined
            ? `Forecast ${units} ${units === 1 ? "unit" : "units"}`
            : "Demand forecast on file",
        sub: "Demand evidence sets the review population. It is not a recovery estimate.",
        facts: [
          ...(horizon !== undefined ? [{ label: "HORIZON", value: `${horizon} months` }] : []),
          ...(units !== undefined ? [{ label: "FORECAST", value: String(units) }] : []),
        ],
        chips: [chipOf(forecast, true)],
      }),
    );
  }

  if (reasons.includes("PRODUCT_TRANSITION")) {
    out.push(
      lens({
        key: "product",
        label: "PRODUCT EVIDENCE",
        headline: "Product transition announced",
        // Quoted from the forecast record rather than restated, so the lens
        // cannot drift from its source.
        sub: note ?? "A successor product has been announced for this line.",
      }),
    );
  }

  const reserve = str(finding.attributes?.["reserve"]);
  const unmet = firstUnmet(finding);
  out.push(
    lens({
      key: "valuation-conclusion",
      label: "MANAGEMENT VALUATION CONCLUSION",
      headline: reserve !== undefined ? `Reserve ${reserve}` : conclusionLabel(input.status),
      sub: "The rule identifies a valuation review. No reserve amount is proposed by any rule, model, or assistant — management records the conclusion.",
      missingChip: unmet !== undefined ? missingChipFor(unmet.description, undefined) : null,
      conflict: unmet !== undefined,
      staleNote: input.staleNote,
    }),
  );
  return out;
}

/**
 * GL-MAN-001 — a manual entry with nothing behind it. There is no physical
 * dimension to a journal entry, so no physical lens is rendered.
 */
function manualGlLenses(input: LensInput): LensView[] {
  const { finding, context } = input;
  const entry = context.evidence.find((e) => e.kind === "GL_ENTRY");
  const c = content(entry);
  const account = str(c?.["account"]);
  const posted = str(c?.["postedDate"]);
  const memo = str(c?.["memo"]);
  const enteredBy = str(c?.["enteredBy"]);
  const amount = num(c?.["amountCents"]);
  const txn = str(c?.["transactionNumber"]) ?? finding.subjects.transactionNumbers?.[0];
  const unmet = unmetAll(finding);
  const out: LensView[] = [];

  out.push(
    lens({
      key: "gl-record",
      label: "GL RECORD",
      headline: txn !== undefined ? `${txn} posted to ${account ?? "inventory"}` : "Manual inventory entry",
      sub: memo !== undefined ? `Memo: “${memo}”.` : null,
      facts: [
        ...(posted !== undefined ? [{ label: "POSTED", value: formatDateShort(posted) }] : []),
        ...(account !== undefined ? [{ label: "ACCOUNT", value: account }] : []),
        ...(amount !== undefined ? [{ label: "AMOUNT", value: formatCents(amount) }] : []),
        ...(enteredBy !== undefined ? [{ label: "ENTERED BY", value: enteredBy }] : []),
      ],
      chips: entry !== undefined ? [chipOf(entry, true)] : [],
      note: "ERP transaction state. Read-only in this MVP — Gaurd never posts, edits or relieves inventory.",
    }),
  );

  const support = unmet[0];
  if (support !== undefined) {
    out.push(
      lens({
        key: "support",
        label: "SUPPORT",
        headline: "No supporting reference on the entry",
        sub: `${support.description} is not in evidence. An entry without support cannot be evaluated on its merits.`,
        // No source is named: NetSuite returned the ENTRY, not the support.
        // Attributing the absent document to the system that holds the entry
        // would claim a source looked and came back empty.
        missingChip: missingChipFor(support.description, undefined),
        conflict: true,
        staleNote: input.staleNote,
      }),
    );
  }

  const control = unmet[1];
  if (control !== undefined) {
    out.push(
      lens({
        key: "control",
        label: "CONTROL REQUIREMENT",
        headline: control.description,
        sub: (finding.reasonCodes ?? []).includes("ABOVE_SUPPORT_THRESHOLD")
          ? "An unsupported manual inventory entry at this size requires controller review before sign-off."
          : "Management review is required before this entry can be relied on.",
        conflict: true,
      }),
    );
  }
  return out;
}

/**
 * The canonical three-layer reality: cutoff, ownership, third-party and the
 * rest. Preserved verbatim from the EXC-001 flagship — with one change: a
 * layer with nothing behind it is dropped rather than filled.
 */
function threeLayerLenses(input: LensInput): LensView[] {
  const { finding, status, context, periodEnd } = input;
  const unitLoc = context.bookUnits[0] ? locationLabel(context.bookUnits[0].location) : undefined;
  const nsEvidence = context.evidence.filter(
    (e) => e.sourceSystem === "NETSUITE_ERP" || e.sourceSystem === "NETSUITE_WMS",
  );
  const physicalEvidence = context.evidence.filter(
    (e) => e.sourceSystem !== undefined && PHYSICAL_SOURCES.includes(e.sourceSystem),
  );

  const physicalFacts: { label: string; value: string; at: string }[] = [];
  const factOf = (kind: string, label: string) => {
    const e = context.evidence.find((x) => x.kind === kind);
    const c = content(e);
    if (c === undefined) return;
    const at =
      kind === "ITEM_FULFILLMENT"
        ? str(c["shipDate"])
        : kind === "INSTALLATION"
          ? str(c["installedAt"])
          : str(c["firstOnlineAt"]);
    if (at !== undefined) physicalFacts.push({ label, value: formatDateShort(at), at });
  };
  factOf("ITEM_FULFILLMENT", "SHIPPED");
  const carrier = context.evidence.find((x) => x.kind === "CARRIER_SHIPMENT");
  const carrierPosition = carrier !== undefined ? carrierFact(carrier) : undefined;
  if (carrierPosition !== undefined) {
    physicalFacts.push({
      label: carrierPosition.label,
      value: formatDateShort(carrierPosition.at),
      at: carrierPosition.at,
    });
  }
  factOf("INSTALLATION", "INSTALLED");
  factOf("TELEMETRY", "FIRST ONLINE");

  // Deployment is a conclusion about the operational facts, not an assumption:
  // it is claimed only where installation or telemetry actually places the unit
  // with the customer on or before the period end.
  const deployedAt = physicalFacts.find(
    (f) => f.label === "INSTALLED" || f.label === "FIRST ONLINE",
  )?.at;
  const physicalHeadline =
    deployedAt !== undefined && periodEnd !== undefined && deployedAt <= periodEnd
      ? "Deployed to customer before year-end"
      : carrierPosition !== undefined && carrierPosition.label !== "DELIVERED"
        ? `${capitalize(carrierPhrase(carrierPosition.label.replace(/ /g, "_")))} — no delivery recorded`
        : "Operational evidence on file";

  const missingReq = firstUnmet(finding);
  const requiredForEvidence = context.evidence.find((e) => e.linkType === "REQUIRED_FOR");
  const provisionGap = requiredForEvidence?.kind === "CONTRACT";

  const out: LensView[] = [];

  out.push(
    lens({
      key: "netsuite",
      label: "NETSUITE SAYS",
      headline: unitLoc !== undefined ? `${unitLoc} Inventory` : "Transaction state",
      sub:
        unitLoc !== undefined
          ? // The date is the reconciliation's own balance-sheet date, read
            // from the service rather than typed into the screen.
            `At ${periodEnd !== undefined ? formatDate(periodEnd) : "the balance-sheet date"} · not relieved`
          : "ERP records referenced by this exception",
      chips: nsEvidence.map((e) => chipOf(e, true)),
      note: "ERP transaction state. Read-only in this MVP — Gaurd never posts, edits or relieves inventory.",
    }),
  );

  // Omitted rather than filled: an exception with no operational dimension
  // says so by not having the lens.
  if (physicalFacts.length > 0 || physicalEvidence.length > 0) {
    out.push(
      lens({
        key: "physical",
        label: "PHYSICAL EVIDENCE SAYS",
        headline: physicalHeadline,
        facts: physicalFacts.map(({ label, value }) => ({ label, value })),
        chips: physicalEvidence.map((e) => chipOf(e)),
      }),
    );
  }

  out.push(
    lens({
      key: "accounting",
      label: "ACCOUNTING EVIDENCE SAYS",
      headline:
        missingReq === undefined
          ? conclusionLabel(status)
          : provisionGap
            ? "Required provision missing"
            : "Required evidence missing",
      sub:
        missingReq === undefined
          ? "Accounting evidence and management review state."
          : finding.ruleId === "CUT-OUT-001"
            ? "Ownership / acceptance terms governing transfer of control are not present in the executed agreement on file."
            : provisionGap && requiredForEvidence !== undefined
              ? `Not present in ${requiredForEvidence.title}: ${missingReq.description}.`
              : `Not in evidence: ${missingReq.description}. Required for the ${finding.ruleId} conclusion.`,
      conflict: missingReq !== undefined,
      missingChip:
        missingReq !== undefined
          ? missingChipFor(missingReq.description, requiredForEvidence)
          : null,
      staleNote: input.staleNote,
    }),
  );

  return out;
}

const BUILDERS: Record<string, (input: LensInput) => LensView[]> = {
  "CNT-EX-001": countExistenceLenses,
  "CNT-COMP-001": countCompletenessLenses,
  "VAL-EO-001": valuationEoLenses,
  "GL-MAN-001": manualGlLenses,
};

/**
 * Interpretation strip: the sentence that stops a reader drawing the wrong
 * conclusion from the lenses above it.
 */
function interpretationFor(ruleId: string): { label: string; text: string } | null {
  if (ruleId === "CUT-OUT-001") {
    return {
      label: "LOCATION IS NOT OWNERSHIP",
      text: "Deployment, installation and telemetry establish where the units are and what happened. They do not establish transfer of control. The customer invoice is billing evidence only. Until the governing provision is in evidence, the conclusion stays Open.",
    };
  }
  if (ruleId === "CNT-COMP-001") {
    return {
      label: "A COUNT IS NOT A RECEIPT",
      text: "Finding a unit on the floor establishes that it is there. It does not establish that the company owns it, what it cost, or which period it belongs to — so it is never added to the book on the strength of the count alone.",
    };
  }
  if (ruleId === "VAL-EO-001") {
    return {
      label: "A REVIEW POPULATION IS NOT A RESERVE",
      text: "Age, demand and product transition identify stock to review. They do not measure recoverable value. The reserve stays undetermined until management concludes under policy.",
    };
  }
  return null;
}

export function buildLenses(input: LensInput): {
  panels: readonly LensView[];
  interpretation: { label: string; text: string } | null;
} {
  const builder = BUILDERS[input.finding.ruleId] ?? threeLayerLenses;
  return {
    panels: builder(input),
    interpretation: interpretationFor(input.finding.ruleId),
  };
}

/** Source-stale note, phrased once for every lens builder. */
export function staleNoteText(
  warning: { sourceSystem: string; status: string; note?: string } | undefined,
): string | null {
  if (warning === undefined) return null;
  return `${sourceName(warning.sourceSystem)} source ${warning.status.toLowerCase()}${
    warning.note !== undefined ? ` — ${warning.note}` : ""
  }`;
}
