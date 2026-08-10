import type {
  AssignmentFixture,
  CarrierShipmentFixture,
  ContractFixture,
  CrmAccountFixture,
  CustodianStatementFixture,
  ForecastFixture,
  InstallationFixture,
  RmaRecordFixture,
  SourceSystemId,
  TelemetryFixture,
} from "@icg/domain";
import {
  BEACON,
  EXC001_CUSTOMER,
  EXC001_IF,
  EXC002_PO,
  EXC009_RMA,
  MERIDIAN,
  PARTIES,
  REDWOOD,
  RETRIEVED_AT,
  SKU_DEFS,
} from "./constants.js";
import { addDays, atTime } from "./dateMath.js";
import { hashObject } from "./hash.js";
import { createPrng } from "./prng.js";
import type { NetSuiteResult } from "./netsuite.js";
import type { UnitsResult } from "./units.js";

const skuByCode = new Map(SKU_DEFS.map((s) => [s.code, s]));
const CUSTOMERS = PARTIES.filter((p) => p.kind === "CUSTOMER").map((p) => p.name);

function opRef(
  sourceSystem: SourceSystemId,
  recordType: string,
  internalId: string,
  lastModifiedAt: string,
) {
  return {
    sourceSystem,
    recordType,
    internalId,
    lastModifiedAt,
    retrievedAt: RETRIEVED_AT,
    sourceHash: hashObject({ sourceSystem, recordType, internalId }),
  };
}

export interface OperationalResult {
  carrierShipments: CarrierShipmentFixture[];
  installations: InstallationFixture[];
  telemetry: TelemetryFixture[];
  contracts: ContractFixture[];
  rmaRecords: RmaRecordFixture[];
  custodianStatements: CustodianStatementFixture[];
  crmAccounts: CrmAccountFixture[];
  forecasts: ForecastFixture[];
  assignments: AssignmentFixture[];
  /**
   * Book-movement corrections derived from operational events: a unit that
   * was installed at a customer or sent out on demo/loan last moved on the
   * books when that event happened, not on an uncoordinated random date.
   * Applied to the unit snapshot by buildDataset before fixtures are emitted.
   */
  unitPatches: Map<string, string>;
}

export function buildOperational(
  seed: string,
  unitsResult: UnitsResult,
  netsuite: NetSuiteResult,
): OperationalResult {
  const { units, story } = unitsResult;
  const prng = createPrng(`${seed}:operational`);
  // Separate stream for time-of-day variation so existing draws stay put.
  const jitterPrng = createPrng(`${seed}:operational:jitter`);
  const jitterTime = (startMinute: number, endMinute: number): string => {
    const m = jitterPrng.int(startMinute, endMinute);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
  };
  const unitPatches = new Map<string, string>();

  // ---- FlightPath carrier shipments ----
  const carrierShipments: CarrierShipmentFixture[] = [];

  // EXC-001: shipped 12/27, delivered 12/29.
  carrierShipments.push({
    id: "FP-88213",
    sourceRef: opRef("FLIGHTPATH", "CARRIER_SHIPMENT", "FP-88213", "2026-12-29T17:45:00Z"),
    carrier: "FlightPath Freight",
    itemFulfillmentNumber: EXC001_IF,
    serials: [...story.exc001Serials],
    events: [
      { eventType: "PICKUP", occurredAt: "2026-12-27T18:20:00Z", location: "KestrelGrid Dock 2" },
      { eventType: "IN_TRANSIT", occurredAt: "2026-12-28T04:10:00Z", location: "FlightPath Hub — Reno" },
      { eventType: "OUT_FOR_DELIVERY", occurredAt: "2026-12-29T14:05:00Z", location: "Harbor District" },
      { eventType: "DELIVERED", occurredAt: "2026-12-29T17:41:00Z", location: "Bluewater Foods Distribution Center" },
    ],
  });

  // Clean FY2026 sale shipments, delivered before year end. Event times vary
  // per shipment — real carrier lanes do not repeat to the minute.
  netsuite.soldChains.forEach((chain, i) => {
    carrierShipments.push({
      id: `FP-88${150 + i}`,
      sourceRef: opRef("FLIGHTPATH", "CARRIER_SHIPMENT", `FP-88${150 + i}`, atTime(chain.deliveredDate, "18:00:00")),
      carrier: "FlightPath Freight",
      itemFulfillmentNumber: chain.fulfillmentNumber,
      serials: [...chain.serials],
      events: [
        { eventType: "PICKUP", occurredAt: atTime(chain.shipDate, jitterTime(16 * 60 + 15, 18 * 60 + 40)), location: "KestrelGrid Dock 2" },
        { eventType: "IN_TRANSIT", occurredAt: atTime(addDays(chain.shipDate, 1), jitterTime(3 * 60 + 50, 6 * 60 + 30)), location: "FlightPath Hub — Reno" },
        { eventType: "DELIVERED", occurredAt: atTime(chain.deliveredDate, jitterTime(13 * 60 + 40, 17 * 60 + 20)), location: `${chain.customer} receiving dock` },
      ],
    });
  });

  // Outbound in transit at year end: picked up late December, undelivered.
  netsuite.stagedOutbound.forEach((so, i) => {
    carrierShipments.push({
      id: `FP-88${219 + i}`,
      sourceRef: opRef("FLIGHTPATH", "CARRIER_SHIPMENT", `FP-88${219 + i}`, "2026-12-31T09:00:00Z"),
      carrier: "FlightPath Freight",
      serials: [...so.serials],
      events: [
        { eventType: "PICKUP", occurredAt: atTime(so.pickupDate, jitterTime(15 * 60 + 30, 18 * 60 + 30)), location: "KestrelGrid Dock 2" },
        { eventType: "IN_TRANSIT", occurredAt: "2026-12-31T08:30:00Z", location: "FlightPath linehaul" },
      ],
    });
  });

  // EXC-002 inbound: vendor shipment picked up 12/29, in transit at 12/31.
  carrierShipments.push({
    id: "FP-IN-2291",
    sourceRef: opRef("FLIGHTPATH", "CARRIER_SHIPMENT", "FP-IN-2291", "2026-12-31T08:00:00Z"),
    carrier: "FlightPath Freight",
    serials: [...story.exc002Serials],
    events: [
      { eventType: "PICKUP", occurredAt: "2026-12-29T15:00:00Z", location: "Volta Components dock" },
      { eventType: "IN_TRANSIT", occurredAt: "2026-12-31T06:00:00Z", location: "FlightPath linehaul" },
    ],
  });

  // Other inbound GIT freight, also in transit at year end.
  const gitInSerialized = story.gitInOtherSerialized;
  carrierShipments.push({
    id: "FP-IN-2288",
    sourceRef: opRef("FLIGHTPATH", "CARRIER_SHIPMENT", "FP-IN-2288", "2026-12-31T08:00:00Z"),
    carrier: "FlightPath Freight",
    serials: [...gitInSerialized],
    events: [
      { eventType: "PICKUP", occurredAt: "2026-12-27T16:00:00Z", location: "Vendor consolidation dock" },
      { eventType: "IN_TRANSIT", occurredAt: "2026-12-31T06:00:00Z", location: "FlightPath linehaul" },
    ],
  });

  // ---- DeployOps installations ----
  const installations: InstallationFixture[] = [
    {
      id: "INST-2688",
      sourceRef: opRef("DEPLOY_OPS", "INSTALLATION", "INST-2688", "2026-12-30T20:00:00Z"),
      serials: [...story.exc001Serials],
      customer: EXC001_CUSTOMER,
      siteName: "Bluewater Harbor Distribution Center",
      installedAt: "2026-12-30T19:30:00Z",
      installedBy: "DeployOps Crew 7",
      status: "COMPLETE",
    },
  ];
  // Customer-site company-owned fleet installs, grouped by customer.
  // Loaner-classified units are excluded: a loaner's customer, dates and
  // paperwork come from its assignment, never from a fleet install sweep.
  const csSerialized = units.filter(
    (u) =>
      u.location === "CUSTOMER_SITE" &&
      u.classification !== "LOANER" &&
      skuByCode.get(u.sku)?.serialized,
  );
  const installCustomers = ["Summit Ridge Health", "Copperline Grocers", "Northgate Fulfillment", "Redstone Manufacturing", "Evergreen Campus Services"];
  const perGroup = Math.ceil(csSerialized.length / installCustomers.length);
  installCustomers.forEach((customer, g) => {
    const group = csSerialized.slice(g * perGroup, (g + 1) * perGroup);
    if (group.length === 0) return;
    const day = `2026-${String(9 + (g % 3)).padStart(2, "0")}-${String(6 + g * 3).padStart(2, "0")}`;
    installations.push({
      id: `INST-2${600 + g}`,
      sourceRef: opRef("DEPLOY_OPS", "INSTALLATION", `INST-2${600 + g}`, atTime(day, "22:00:00")),
      serials: group.map((u) => u.serial),
      customer,
      siteName: `${customer} main site`,
      installedAt: atTime(day, "19:00:00"),
      installedBy: `DeployOps Crew ${1 + (g % 5)}`,
      status: "COMPLETE",
    });
    // The unit's last book movement is the shipment to the install site.
    for (const u of group) unitPatches.set(u.serial, day);
  });
  // EXC-008: the loaner KE-Y1 installed at the customer site in October.
  installations.push({
    id: "INST-2641",
    sourceRef: opRef("DEPLOY_OPS", "INSTALLATION", "INST-2641", "2026-10-06T21:00:00Z"),
    serials: [story.exc008Serial],
    customer: "Silver Fir Hotels",
    siteName: "Silver Fir Hotels — Lakeview property",
    installedAt: "2026-10-06T18:45:00Z",
    installedBy: "DeployOps Crew 3",
    status: "COMPLETE",
  });

  // ---- DeviceCloud telemetry ----
  const telemetry: TelemetryFixture[] = [];
  for (const serial of story.exc001Serials) {
    telemetry.push({
      id: `TL-${serial}`,
      sourceRef: opRef("DEVICE_CLOUD", "TELEMETRY_SUMMARY", `TL-${serial}`, "2027-01-06T23:30:00Z"),
      serial,
      firstOnlineAt: "2026-12-30T21:05:00Z",
      lastSeenAt: "2027-01-06T23:00:00Z",
    });
  }
  for (const inst of installations.slice(1)) {
    for (const serial of inst.serials) {
      telemetry.push({
        id: `TL-${serial}`,
        sourceRef: opRef("DEVICE_CLOUD", "TELEMETRY_SUMMARY", `TL-${serial}`, "2027-01-06T23:30:00Z"),
        serial,
        // Online the evening of the install (crews finish 19:00), check-in
        // times varying per device rather than one repeated instant.
        firstOnlineAt: atTime(inst.installedAt.slice(0, 10), jitterTime(19 * 60 + 40, 23 * 60 + 45)),
        lastSeenAt: atTime("2027-01-06", jitterTime(19 * 60 + 30, 23 * 60 + 15)),
      });
    }
  }

  // ---- AccordVault contracts (repository sync stale since 12/26) ----
  const vaultModified = "2026-12-24T11:00:00Z";
  const contracts: ContractFixture[] = [
    {
      // EXC-001: the governing agreement's ownership-transfer and acceptance
      // provisions cannot be located — missing is stated as missing.
      id: "CT-001",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "MSA-2026-041", vaultModified),
      counterparty: EXC001_CUSTOMER,
      title: "Master Purchase Agreement MSA-2026-041",
      effectiveDate: "2026-03-15",
      provisions: [
        { provisionType: "RETURN_TERMS", status: "PRESENT", documentRef: "MSA-2026-041 §9" },
        { provisionType: "OWNERSHIP_TRANSFER", status: "MISSING" },
        { provisionType: "ACCEPTANCE", status: "MISSING" },
      ],
    },
    {
      // EXC-008: at year-end retrieval the title-retention addendum cannot
      // be located (AccordVault index stale since 12/26). Scenario event
      // SE-008 locates LA-2026-118-ADD-2 during the close.
      id: "CT-002",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "LN-2026-118", vaultModified),
      counterparty: "Silver Fir Hotels",
      title: "Equipment Loaner Agreement LN-2026-118",
      effectiveDate: "2026-10-01",
      provisions: [
        { provisionType: "LOANER_TERMS", status: "PRESENT", documentRef: "LA-2026-118" },
        { provisionType: "TITLE_RETENTION", status: "MISSING" },
      ],
    },
    {
      // Standard master terms covering the routine loaner fleet: title is
      // retained by KestrelGrid; evidence is locatable at year end.
      id: "CT-014",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "LNM-2025-001", vaultModified),
      counterparty: "KestrelGrid AI — standard loaner program",
      title: "Standard Equipment Loaner Master Agreement",
      effectiveDate: "2025-06-01",
      provisions: [
        { provisionType: "LOANER_TERMS", status: "PRESENT", documentRef: "LNM-2025-001 §2" },
        { provisionType: "TITLE_RETENTION", status: "PRESENT", documentRef: "LNM-2025-001 §4" },
      ],
    },
    {
      id: "CT-003",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "DEMO-2026-072", vaultModified),
      counterparty: "Ironvale Robotics",
      title: "Demonstration Evaluation Agreement",
      effectiveDate: "2026-05-28",
      provisions: [
        { provisionType: "DEMO_TERMS", status: "PRESENT", documentRef: "DEMO-2026-072 §3" },
        { provisionType: "TITLE_RETENTION", status: "PRESENT", documentRef: "DEMO-2026-072 §4" },
      ],
    },
    {
      id: "CT-004",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "CUST-2025-009", vaultModified),
      counterparty: REDWOOD,
      title: "Field Custody & Installation Services Agreement",
      effectiveDate: "2025-11-01",
      provisions: [{ provisionType: "CUSTODY", status: "PRESENT", documentRef: "CUST-2025-009 §2" }],
    },
    {
      id: "CT-005",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "CUST-2025-014", vaultModified),
      counterparty: BEACON,
      title: "Field Services Custody Agreement",
      effectiveDate: "2025-08-12",
      provisions: [{ provisionType: "CUSTODY", status: "PRESENT", documentRef: "CUST-2025-014 §2" }],
    },
    {
      id: "CT-006",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "CM-2025-002", vaultModified),
      counterparty: MERIDIAN,
      title: "Contract Manufacturing & Consignment Agreement",
      effectiveDate: "2025-05-01",
      provisions: [{ provisionType: "CUSTODY", status: "PRESENT", documentRef: "CM-2025-002 §6" }],
    },
    {
      id: "CT-007",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "SUP-2025-011", vaultModified),
      counterparty: "Volta Components Ltd",
      title: "Supply Agreement — FOB Origin",
      effectiveDate: "2025-02-10",
      provisions: [{ provisionType: "OWNERSHIP_TRANSFER", status: "PRESENT", documentRef: "SUP-2025-011 §5" }],
    },
    {
      id: "CT-008",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "SUP-2025-004", vaultModified),
      counterparty: MERIDIAN,
      title: "Supply Agreement",
      effectiveDate: "2025-01-20",
      provisions: [{ provisionType: "OWNERSHIP_TRANSFER", status: "PRESENT", documentRef: "SUP-2025-004 §5" }],
    },
    {
      id: "CT-009",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "SUP-2025-019", vaultModified),
      counterparty: "Cascade Systems Assembly",
      title: "Supply Agreement",
      effectiveDate: "2025-04-02",
      provisions: [{ provisionType: "OWNERSHIP_TRANSFER", status: "PRESENT", documentRef: "SUP-2025-019 §5" }],
    },
    {
      // EXC-002: the freight & title rider for PO-26-1187 cannot be located.
      id: "CT-010",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "RID-2026-118", vaultModified),
      counterparty: "Volta Components Ltd",
      title: `Freight & Title Rider — ${EXC002_PO}`,
      effectiveDate: "2026-12-15",
      provisions: [{ provisionType: "OWNERSHIP_TRANSFER", status: "MISSING" }],
    },
    {
      id: "CT-011",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "MSA-2025-030", vaultModified),
      counterparty: "Summit Ridge Health",
      title: "Master Purchase Agreement",
      effectiveDate: "2025-06-15",
      provisions: [
        { provisionType: "OWNERSHIP_TRANSFER", status: "PRESENT", documentRef: "MSA-2025-030 §7" },
        { provisionType: "ACCEPTANCE", status: "PRESENT", documentRef: "MSA-2025-030 §8" },
      ],
    },
    {
      id: "CT-012",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "MSA-2025-041", vaultModified),
      counterparty: "Northgate Fulfillment",
      title: "Master Purchase Agreement",
      effectiveDate: "2025-09-01",
      provisions: [
        { provisionType: "OWNERSHIP_TRANSFER", status: "PRESENT", documentRef: "MSA-2025-041 §7" },
        { provisionType: "ACCEPTANCE", status: "PRESENT", documentRef: "MSA-2025-041 §8" },
      ],
    },
    {
      id: "CT-013",
      sourceRef: opRef("ACCORD_VAULT", "CONTRACT", "MSA-2026-007", vaultModified),
      counterparty: "Lakeshore Retail Co",
      title: "Master Purchase Agreement",
      effectiveDate: "2026-01-22",
      provisions: [
        { provisionType: "OWNERSHIP_TRANSFER", status: "PRESENT", documentRef: "MSA-2026-007 §7" },
        { provisionType: "ACCEPTANCE", status: "PRESENT", documentRef: "MSA-2026-007 §8" },
      ],
    },
  ];

  // ---- ReturnLoop RMA records: one per unit in the RMA area, plus the
  // damaged return that moved to the hold area (EXC-012). ----
  const rmaRecords: RmaRecordFixture[] = [];
  const rmaUnits = units.filter((u) => u.location === "RMA_REPAIR");
  const reasons = ["Field failure — diagnostics pending", "Camera gimbal fault", "Firmware fault — repair queue", "Customer return — order error", "Intermittent power fault"];
  const statuses = ["RECEIVED", "IN_EVALUATION", "IN_REPAIR"] as const;
  let rmaSeq = 400;
  let kvz1Seen = 0;
  for (const u of rmaUnits) {
    rmaSeq += 1;
    // 0451/0452 are reserved for the EXC-009 pair; the counter skips them.
    if (rmaSeq === 451) rmaSeq = 453;
    let id = `RMA-2026-0${rmaSeq}`;
    // The return arrived when the unit moved into the RMA area; the intake
    // desk logs it at a per-return time, not one repeated instant.
    let receivedAt = atTime(u.lastMovementAt ?? "2026-12-10", jitterTime(14 * 60 + 30, 18 * 60 + 45));
    let reason = reasons[prng.int(0, reasons.length - 1)]!;
    let status: RmaRecordFixture["status"] = statuses[prng.int(0, statuses.length - 1)]!;
    let customer = CUSTOMERS[prng.int(0, CUSTOMERS.length - 1)]!;
    // EXC-009: the two KV-Z1 returns behind the duplicated re-add.
    if (u.sku === "KV-Z1" && kvz1Seen < 2) {
      kvz1Seen += 1;
      id = kvz1Seen === 1 ? EXC009_RMA : "RMA-2026-0452";
      receivedAt = "2026-12-22T18:20:00Z";
      reason = "Camera gimbal fault";
      status = "RECEIVED";
      customer = "Copperline Grocers";
    }
    rmaRecords.push({
      id,
      sourceRef: opRef("RETURN_LOOP", "RMA", id, receivedAt),
      ...(skuByCode.get(u.sku)?.serialized ? { serial: u.serial } : {}),
      sku: u.sku,
      customer,
      receivedAt,
      reason,
      status,
    });
  }
  rmaRecords.push({
    id: "RMA-2026-0468",
    sourceRef: opRef("RETURN_LOOP", "RMA", "RMA-2026-0468", "2026-12-19T16:10:00Z"),
    serial: story.exc012Serial,
    sku: "KE-E1",
    customer: "Halcyon Logistics",
    receivedAt: "2026-12-19T16:10:00Z",
    reason: "Damaged in transit — freight claim filed",
    status: "CLOSED",
  });

  // ---- Third-party custodian statements ----
  const custodianUnits = (custodian: string) =>
    units.filter((u) => u.custodian === custodian);
  const statementLines = (custodian: string) => {
    const bySku = new Map<string, number>();
    for (const u of custodianUnits(custodian)) {
      bySku.set(u.sku, (bySku.get(u.sku) ?? 0) + 1);
    }
    return [...bySku.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([sku, quantity]) => ({ sku, quantity }));
  };
  const custodianStatements: CustodianStatementFixture[] = [
    {
      // EXC-007: Redwood has not responded to the confirmation request.
      id: "ST-001",
      custodian: REDWOOD,
      asOf: "2026-12-31",
      requestedAt: "2026-12-28T17:00:00Z",
    },
    {
      id: "ST-002",
      custodian: BEACON,
      asOf: "2026-12-31",
      requestedAt: "2026-12-28T17:00:00Z",
      respondedAt: "2027-01-02T15:30:00Z",
      lines: statementLines(BEACON),
    },
    {
      id: "ST-003",
      custodian: MERIDIAN,
      asOf: "2026-12-31",
      requestedAt: "2026-12-28T17:00:00Z",
      respondedAt: "2027-01-02T19:10:00Z",
      lines: statementLines(MERIDIAN),
    },
  ];

  // ---- KestrelCRM accounts ----
  const segments = ["Food & Beverage", "Healthcare", "Industrial", "Retail", "Hospitality", "Logistics"];
  const regions = ["West", "Mountain", "Central", "Northeast"];
  const crmAccounts: CrmAccountFixture[] = CUSTOMERS.map((name, i) => ({
    id: `AC-${String(i + 1).padStart(3, "0")}`,
    sourceRef: opRef("KESTREL_CRM", "ACCOUNT", `AC-${String(i + 1).padStart(3, "0")}`, "2027-01-06T12:00:00Z"),
    name,
    segment: segments[i % segments.length]!,
    region: regions[i % regions.length]!,
  }));

  // ---- ForecastPlatform demand forecasts ----
  const forecasts: ForecastFixture[] = SKU_DEFS.map((s, i) => {
    const lowDemand = s.code === "KE-M1";
    return {
      id: `FC-${String(i + 1).padStart(3, "0")}`,
      sourceRef: opRef("FORECAST_PLATFORM", "DEMAND_FORECAST", `FC-${String(i + 1).padStart(3, "0")}`, "2027-01-05T08:00:00Z"),
      sku: s.code,
      horizonMonths: 12,
      // EXC-011 input: KE-M1 demand collapsed after the KE-M2 transition.
      forecastUnits: lowDemand ? 8 : Math.max(4, Math.round(s.units * (0.6 + prng.next() * 0.6))),
      ...(lowDemand
        ? { note: "KE-M2 transition announced Q3 FY2026; forecast reduced to residual service demand" }
        : {}),
    };
  });

  // ---- Demo / loaner assignments ----
  const assignments: AssignmentFixture[] = [];
  const demoSerialized = units.filter(
    (u) => u.location === "DEMO_LOANER" && u.classification === "DEMO" && skuByCode.get(u.sku)?.serialized,
  );
  demoSerialized.forEach((u, i) => {
    if (u.serial === story.exc010Serial) {
      // EXC-010: on demo at Ironvale since May 2026.
      assignments.push({
        id: `AS-D${String(i + 1).padStart(3, "0")}`,
        kind: "DEMO",
        serial: u.serial,
        customer: "Ironvale Robotics",
        startedAt: "2026-05-31",
        contractId: "CT-003",
      });
      return;
    }
    if (i < 12) {
      assignments.push({
        id: `AS-D${String(i + 1).padStart(3, "0")}`,
        kind: "DEMO",
        serial: u.serial,
        customer: CUSTOMERS[i % CUSTOMERS.length]!,
        startedAt: `2026-${String(prng.int(9, 12)).padStart(2, "0")}-${String(prng.int(1, 27)).padStart(2, "0")}`,
      });
    }
  });
  const loanerSerialized = units.filter(
    (u) => u.location === "CUSTOMER_SITE" && u.classification === "LOANER" && skuByCode.get(u.sku)?.serialized,
  );
  loanerSerialized.forEach((u, i) => {
    const isExc008 = u.serial === story.exc008Serial;
    assignments.push({
      id: `AS-L${String(i + 1).padStart(3, "0")}`,
      kind: "LOANER",
      serial: u.serial,
      customer: isExc008 ? "Silver Fir Hotels" : CUSTOMERS[(i + 2) % CUSTOMERS.length]!,
      startedAt: isExc008
        ? "2026-10-05"
        : `2026-${String(prng.int(8, 11)).padStart(2, "0")}-${String(prng.int(1, 27)).padStart(2, "0")}`,
      // EXC-008's loaner runs on the bespoke Silver Fir agreement whose
      // title clause is initially unlocatable; the rest ride the standard
      // master with title retention evidenced up front.
      contractId: isExc008 ? "CT-002" : "CT-014",
    });
  });

  // A demo or loaner unit's last book movement is the day it went out on
  // its assignment (EXC-010's hand-pinned 2026-05-31 is its startedAt, so
  // this is an identity for the designed story). Assignments win over any
  // earlier patch — an assigned unit's story is its assignment.
  for (const a of assignments) {
    unitPatches.set(a.serial, a.startedAt);
  }

  return {
    carrierShipments,
    installations,
    telemetry,
    contracts,
    rmaRecords,
    custodianStatements,
    crmAccounts,
    forecasts,
    assignments,
    unitPatches,
  };
}
