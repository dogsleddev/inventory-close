import type { InventoryItemFixture } from "@icg/domain";
import { ALLOCATION_PLAN } from "./allocation.js";
import {
  BEACON,
  MERIDIAN,
  REDWOOD,
  REDWOOD_COMPOSITION,
  SERIAL_EXC001_LINKED,
  SERIAL_EXC001_PRIMARY,
  SERIAL_EXC003_NOT_FOUND,
  SERIAL_EXC004_OFF_BOOK,
  SKU_DEFS,
} from "./constants.js";
import { RETRIEVED_AT } from "./constants.js";
import { hashObject } from "./hash.js";
import type { Prng } from "./prng.js";
import { createPrng } from "./prng.js";

const skuByCode = new Map(SKU_DEFS.map((s) => [s.code, s]));

/** Deterministic per-SKU serial registry; canonical serials are reserved. */
export class SerialRegistry {
  private readonly used = new Map<string, Set<number>>();
  private readonly prngs = new Map<string, Prng>();

  constructor(private readonly seed: string) {
    // Reserve canonical serials so random minting can never collide.
    this.reserve("KE-E2", 1048);
    this.reserve("KE-E2", 1051);
    this.reserve("KE-X1", 3498);
    this.reserve("KE-X1", 8842);
  }

  private reserve(sku: string, n: number): void {
    let set = this.used.get(sku);
    if (!set) {
      set = new Set();
      this.used.set(sku, set);
    }
    set.add(n);
  }

  mint(sku: string): string {
    let prng = this.prngs.get(sku);
    if (!prng) {
      prng = createPrng(`${this.seed}:serials:${sku}`);
      this.prngs.set(sku, prng);
    }
    const set = this.used.get(sku) ?? new Set<number>();
    this.used.set(sku, set);
    let n = prng.int(1000, 9999);
    while (set.has(n)) {
      n = prng.int(1000, 9999);
    }
    set.add(n);
    return `${sku}-${n}`;
  }
}

export interface StoryUnits {
  /** EXC-001: primary and linked KE-E2, book location still Warehouse. */
  exc001Serials: readonly [string, string];
  /** EXC-002: three KE-X1 inbound in transit, ownership unresolved. */
  exc002Serials: readonly string[];
  exc003Serial: string;
  /** EXC-004 unit is off-book by design — never in the unit list. */
  exc004Serial: string;
  /** EXC-006: KE-E2 moved Warehouse → Staging during the count window. */
  exc006Serial: string;
  /** EXC-013: KE-E2 whose serial appears in two WMS locations. */
  exc013Serial: string;
  /** EXC-014: KE-X1 received 12/30, GL posting delayed to January. */
  exc014Serial: string;
  /** EXC-010: KE-X1 on demo since May 2026. */
  exc010Serial: string;
  /** EXC-008: KE-Y1 loaner at a customer site. */
  exc008Serial: string;
  /** EXC-012: KE-E1 damaged return in the hold area. */
  exc012Serial: string;
  /** Serials of the other (non-EXC-002) inbound GIT units. */
  gitInOtherSerialized: readonly string[];
  redwoodUnits: readonly { sku: string; serial?: string }[];
}

export interface UnitsResult {
  units: readonly InventoryItemFixture[];
  story: StoryUnits;
  registry: SerialRegistry;
}

const mkSourceRef = (internalId: string) => ({
  sourceSystem: "NETSUITE_ERP" as const,
  recordType: "INVENTORY_SNAPSHOT",
  internalId,
  retrievedAt: RETRIEVED_AT,
  sourceHash: hashObject({ recordType: "INVENTORY_SNAPSHOT", internalId }),
});

/** Month pools per cell for acquisition dates (YYYY-MM). */
function acquisitionMonths(cellId: string): readonly string[] {
  switch (cellId) {
    case "WH_VR":
      // Valuation-review stock is old: acquired H1-2025, no movement since
      // 2025 — the 365+ day aging input for VAL-EO-001.
      return ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08"];
    case "RCV_FH":
    case "GIT_IN":
      return ["2026-12"];
    case "DL_DEMO":
    case "DL_LOANER":
      // Demo/loaner stock must exist before its assignments start (the
      // earliest designed assignment is EXC-010's 2026-05-31 demo).
      return ["2025-09", "2025-11", "2026-01", "2026-02", "2026-03", "2026-04"];
    case "CS_FH":
    case "CS_LOANER":
      // Customer-site units are installed from September on.
      return ["2025-09", "2025-11", "2026-01", "2026-03", "2026-05", "2026-06"];
    case "RMA_RMA":
    case "DMG_DMG":
      // Returns arrive September–December; units were acquired earlier.
      return ["2025-09", "2025-11", "2026-01", "2026-03", "2026-05", "2026-08"];
    default:
      return [
        "2025-09", "2025-11", "2026-01", "2026-02", "2026-03", "2026-04",
        "2026-05", "2026-06", "2026-08", "2026-09", "2026-10", "2026-11",
      ];
  }
}

function lastMovement(cellId: string, acquiredAt: string, prng: Prng): string {
  switch (cellId) {
    case "WH_VR":
      return `2025-${prng.int(10, 11)}-${String(prng.int(1, 28)).padStart(2, "0")}`;
    case "RMA_RMA":
    case "DMG_DMG":
      return `2026-12-${String(prng.int(5, 22)).padStart(2, "0")}`;
    case "STG_FH":
      return `2026-12-${String(prng.int(10, 24)).padStart(2, "0")}`;
    case "GIT_OUT":
      return `2026-12-${String(prng.int(28, 30)).padStart(2, "0")}`;
    case "GIT_IN":
    case "RCV_FH":
      return acquiredAt;
    default: {
      // Some later movement in 2026, never before acquisition.
      const acquiredYear = Number(acquiredAt.slice(0, 4));
      const acquiredMonth = Number(acquiredAt.slice(5, 7));
      const acquiredDay = Number(acquiredAt.slice(8, 10));
      const month = acquiredYear < 2026 ? prng.int(1, 12) : prng.int(Math.min(acquiredMonth, 12), 12);
      const minDay = acquiredYear === 2026 && month === acquiredMonth ? acquiredDay : 1;
      return `2026-${String(month).padStart(2, "0")}-${String(prng.int(minDay, 28)).padStart(2, "0")}`;
    }
  }
}

export function buildUnits(seed: string): UnitsResult {
  const registry = new SerialRegistry(seed);
  const prng = createPrng(`${seed}:units`);
  const units: InventoryItemFixture[] = [];
  let accessorySeq = 0;
  let snapshotSeq = 0;

  const story = {
    exc001Serials: [SERIAL_EXC001_PRIMARY, SERIAL_EXC001_LINKED] as [string, string],
    exc002Serials: [] as string[],
    exc003Serial: SERIAL_EXC003_NOT_FOUND,
    exc004Serial: SERIAL_EXC004_OFF_BOOK,
    exc006Serial: "",
    exc013Serial: "",
    exc014Serial: "",
    exc010Serial: "",
    exc008Serial: "",
    exc012Serial: "",
    gitInOtherSerialized: [] as string[],
    redwoodUnits: [] as { sku: string; serial?: string }[],
  };

  for (const cell of ALLOCATION_PLAN) {
    const months = acquisitionMonths(cell.id);
    // Track how many Redwood pins remain per SKU for the custody cell.
    const redwoodRemaining = new Map(
      cell.id === "TPC_TP"
        ? REDWOOD_COMPOSITION.map((r) => [r.sku, r.units])
        : [],
    );

    for (const [sku, count] of Object.entries(cell.skuUnits)) {
      const def = skuByCode.get(sku);
      if (!def) {
        throw new Error(`Unknown SKU in allocation: ${sku}`);
      }
      // One acquisition batch per cell×SKU keeps units aligned with a single
      // purchase receipt; the PRNG picks the batch month deterministically.
      // The warehouse KE-S1 batch must exist before its designed May cycle
      // count (CNT-CC-2026-05, stories.test) — its pool stops at March.
      const feasibleMonths =
        cell.id === "WH_FH" && sku === "KE-S1"
          ? months.filter((m) => m <= "2026-03")
          : months;
      const month = feasibleMonths[prng.int(0, feasibleMonths.length - 1)]!;
      const day =
        cell.id === "GIT_IN"
          ? prng.int(27, 29)
          : cell.id === "RCV_FH"
            ? prng.int(18, 29)
            : prng.int(2, 27);
      const acquiredAt = `${month}-${String(day).padStart(2, "0")}`;

      for (let i = 0; i < count; i++) {
        let serial: string;
        if (cell.id === "WH_FH" && sku === "KE-E2" && i === 0) {
          serial = SERIAL_EXC001_PRIMARY;
        } else if (cell.id === "WH_FH" && sku === "KE-E2" && i === 1) {
          serial = SERIAL_EXC001_LINKED;
        } else if (cell.id === "WH_FH" && sku === "KE-X1") {
          serial = SERIAL_EXC003_NOT_FOUND;
        } else if (def.serialized) {
          serial = registry.mint(sku);
        } else {
          accessorySeq += 1;
          serial = `${sku}-U${String(accessorySeq).padStart(4, "0")}`;
        }

        let custodian: string | undefined;
        if (cell.id === "TPC_TP") {
          const remaining = redwoodRemaining.get(sku) ?? 0;
          if (remaining > 0) {
            custodian = REDWOOD;
            redwoodRemaining.set(sku, remaining - 1);
            story.redwoodUnits.push(
              def.serialized ? { sku, serial } : { sku },
            );
          } else {
            custodian = BEACON;
          }
        } else if (cell.id === "CM_TP") {
          custodian = MERIDIAN;
        }

        // Story-unit selection (first eligible unit in each pinned cell).
        if (cell.id === "WH_FH" && sku === "KE-E2" && i === 2) story.exc006Serial = serial;
        if (cell.id === "WH_FH" && sku === "KE-E2" && i === 3) story.exc013Serial = serial;
        if (cell.id === "GIT_IN" && sku === "KE-X1") {
          if (i < 3) story.exc002Serials.push(serial);
          else story.gitInOtherSerialized.push(serial);
        }
        if (cell.id === "GIT_IN" && (sku === "KE-E1" || sku === "KE-Y1")) {
          story.gitInOtherSerialized.push(serial);
        }
        if (cell.id === "RCV_FH" && sku === "KE-X1" && i === 0) story.exc014Serial = serial;
        if (cell.id === "DL_DEMO" && sku === "KE-X1" && i === 0) story.exc010Serial = serial;
        if (cell.id === "CS_LOANER" && sku === "KE-Y1" && i === 0) story.exc008Serial = serial;
        if (cell.id === "DMG_DMG" && sku === "KE-E1") story.exc012Serial = serial;

        const isExc010 = cell.id === "DL_DEMO" && sku === "KE-X1" && i === 0;
        snapshotSeq += 1;
        units.push({
          serial,
          sku,
          location: cell.location,
          classification: cell.classification,
          unitCostCents: def.unitCostCents,
          sourceRef: mkSourceRef(String(80000 + snapshotSeq)),
          acquiredAt,
          // EXC-010's demo unit last moved when the demo started (2026-05-31).
          lastMovementAt: isExc010 ? "2026-05-31" : lastMovement(cell.id, acquiredAt, prng),
          ...(custodian ? { custodian } : {}),
        });
      }
    }
  }

  // Story-date coherence: units tied to canonical dated events carry those
  // dates rather than their batch dates.
  const patch = (serial: string, p: Partial<InventoryItemFixture>) => {
    const i = units.findIndex((u) => u.serial === serial);
    if (i >= 0) units[i] = { ...units[i]!, ...p };
  };
  for (const s of story.exc002Serials) {
    // EXC-002: vendor shipped 12/29; booked to GIT on the December bill.
    patch(s, { acquiredAt: "2026-12-29", lastMovementAt: "2026-12-29" });
  }
  // EXC-014: received 12/30 on IR-26-2214.
  patch(story.exc014Serial, { acquiredAt: "2026-12-30", lastMovementAt: "2026-12-30" });
  // EXC-012: damaged return received 12/19 (RMA-2026-0468).
  patch(story.exc012Serial, { lastMovementAt: "2026-12-19" });
  // EXC-009: the two duplicated KV-Z1 returns arrived 12/22.
  let kvz1InRma = 0;
  units.forEach((u, i) => {
    if (u.sku === "KV-Z1" && u.location === "RMA_REPAIR" && kvz1InRma < 2) {
      kvz1InRma += 1;
      units[i] = { ...u, lastMovementAt: "2026-12-22" };
    }
  });

  if (units.length !== 1500) {
    throw new Error(`Expected 1500 units, generated ${units.length}`);
  }
  for (const key of [
    "exc006Serial", "exc013Serial", "exc014Serial", "exc010Serial",
    "exc008Serial", "exc012Serial",
  ] as const) {
    if (!story[key]) {
      throw new Error(`Story unit not assigned: ${key}`);
    }
  }
  if (story.exc002Serials.length !== 3) {
    throw new Error("EXC-002 requires exactly three inbound KE-X1 serials");
  }
  if (story.redwoodUnits.length !== 14) {
    throw new Error(
      `Redwood composition must be 14 units, got ${story.redwoodUnits.length}`,
    );
  }

  return { units, story, registry };
}
