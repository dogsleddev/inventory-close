import { describe, expect, it } from "vitest";
import { buildDataset, toCloseInput } from "@icg/data";
import { runClose } from "@icg/rules";
import {
  CANONICAL_DATASET_VERSION,
  CANONICAL_GENERATOR_SEED,
  CANONICAL_SCENARIO_SCRIPT,
  SOURCE_SYSTEM_IDS,
} from "@icg/domain";
import { collect, SHIPPED_SOURCE_ROOTS, SOURCE_EXTENSIONS } from "./repo-scan";

/**
 * Stage 09 — exact stale-reference scan (prompt 09).
 *
 * Two failure modes this catches, both of which typecheck and lint clean:
 *
 * 1. **A dead identifier.** A serial, exception or workpaper id written into
 *    source that the dataset no longer contains renders as a confident,
 *    specific, wrong reference. The check is existence against the built
 *    dataset, not a hand-maintained allowlist — an allowlist would go stale
 *    in exactly the way it is meant to detect.
 * 2. **A superseded name.** `FY2026-DEMO-v1.1.0` replaced an earlier dataset
 *    identity, and the CHANGELOG locks the floor-to-sheet completeness serial
 *    to KE-X1-8842. Anything still naming the old ones is a stale reference.
 */

const dataset = buildDataset();
const close = runClose(toCloseInput(dataset));
const source = collect(SHIPPED_SOURCE_ROOTS, SOURCE_EXTENSIONS);

/**
 * Every serial the dataset knows about — not only the ones on the book.
 * KE-X1-8842 is a floor-to-sheet discovery and deliberately absent from
 * `inventoryUnits`; taking the vocabulary from the whole dataset keeps the
 * check honest about which serials exist rather than which ones are booked.
 */
const serials = new Set(
  [...JSON.stringify(dataset).matchAll(/KE-[A-Z][0-9]-[0-9]{4}/g)].map((m) => m[0]),
);
const bookedSerials = new Set(dataset.inventoryUnits.map((u) => u.serial));
const exceptionIds = new Set(close.exceptions.map((e) => e.id));
const pbcIds = new Set(close.pbc.map((p) => p.id));
const ruleIds = new Set(close.ruleExecutions.map((e) => String(e.ruleId)));

/** Every match of `pattern` across the shipped source, with its file. */
function hits(pattern: RegExp): { file: string; value: string }[] {
  const found: { file: string; value: string }[] = [];
  for (const file of source) {
    for (const match of file.text.matchAll(pattern)) {
      found.push({ file: file.path, value: match[0] });
    }
  }
  return found;
}

describe("the scan covers what it claims to cover", () => {
  it("reads every shipped source root", () => {
    expect(source.length).toBeGreaterThan(60);
    for (const root of SHIPPED_SOURCE_ROOTS) {
      expect(
        source.some((f) => f.path.startsWith(root)),
        `${root} contributed no files — the scan would pass without reading it`,
      ).toBe(true);
    }
  });
});

describe("every identifier written into source still exists", () => {
  it("names no serial the dataset does not contain", () => {
    const unknown = hits(/KE-[A-Z][0-9]-[0-9]{4}/g).filter((h) => !serials.has(h.value));
    expect(unknown.map((h) => `${h.file}: ${h.value}`)).toEqual([]);
  });

  it("names no exception the close does not derive", () => {
    const unknown = hits(/EXC-[0-9]{3}/g).filter((h) => !exceptionIds.has(h.value));
    expect(unknown.map((h) => `${h.file}: ${h.value}`)).toEqual([]);
  });

  it("names no PBC workpaper outside the baseline", () => {
    const unknown = hits(/PBC-[0-9]{3}/g).filter((h) => !pbcIds.has(h.value));
    expect(unknown.map((h) => `${h.file}: ${h.value}`)).toEqual([]);
  });

  it("names no rule the registry does not execute", () => {
    // Rule ids appear as string literals in tests, prompts and comments;
    // this is the shipped source only, where a dead id would be read as a
    // live control reference.
    // The middle segment must contain a letter: DEMO-2026-072 is a demo
    // agreement number, not a rule, and a looser pattern reports it as a
    // dead rule id forever.
    const unknown = hits(
      /\b(?:CUT|CNT|TPI|OWN|RMA|DEMO|VAL|DQ|REC|GL|PROC|O2C)-(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,6}-[0-9]{3}\b/g,
    ).filter((h) => !ruleIds.has(h.value));
    expect(unknown.map((h) => `${h.file}: ${h.value}`)).toEqual([]);
  });

  it("names no source system outside the canonical nine", () => {
    const canonical = new Set<string>(SOURCE_SYSTEM_IDS);
    const unknown = hits(/\b[A-Z]+_(?:ERP|WMS|OPS|CLOUD|VAULT|LOOP|CRM|PLATFORM)\b/g).filter(
      (h) => !canonical.has(h.value),
    );
    expect(unknown.map((h) => `${h.file}: ${h.value}`)).toEqual([]);
  });
});

describe("no deprecated dataset name survives", () => {
  const DEPRECATED = [
    // Superseded by the NetSuite architecture amendment (CHANGELOG).
    /FY2026-DEMO-v1\.0\.\d+/g,
    /SCENARIO-EVENTS-v1\.0\.\d+/g,
    /ICG-FY2026-DEMO-00[013-9]/g,
  ];

  it("uses only the canonical dataset, seed and scenario identities", () => {
    for (const pattern of DEPRECATED) {
      expect(hits(pattern).map((h) => `${h.file}: ${h.value}`)).toEqual([]);
    }
    // And the canonical ones are what the run actually stamps.
    expect(close.runManifest.datasetVersion).toBe(CANONICAL_DATASET_VERSION);
    expect(close.runManifest.scenarioScriptVersion).toBe(CANONICAL_SCENARIO_SCRIPT);
    expect(dataset.manifest.generatorSeed).toBe(CANONICAL_GENERATOR_SEED);
  });
});

describe("the completeness serial is the corrected one", () => {
  const COMPLETENESS_SERIAL = "KE-X1-8842";

  it("associates floor-to-sheet completeness with KE-X1-8842 and nothing else", () => {
    // The CHANGELOG locks this correction. A sentence that names the
    // completeness finding and a DIFFERENT serial in the same breath is the
    // exact stale reference this scan exists for.
    const near =
      /(floor[- ]to[- ]sheet|CNT-COMP-001|EXC-004)[\s\S]{0,160}?(KE-[A-Z][0-9]-[0-9]{4})/gi;
    const wrong: string[] = [];
    for (const file of source) {
      for (const match of file.text.matchAll(near)) {
        if (match[2] !== COMPLETENESS_SERIAL) wrong.push(`${file.path}: ${match[2]}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("still derives EXC-004 on that serial, so the scan is anchored to live data", () => {
    const exc004 = close.exceptions.find((e) => e.id === "EXC-004");
    expect(exc004?.finding.subjects.serials).toContain(COMPLETENESS_SERIAL);
    // Known to the dataset, absent from the book: that IS the exception.
    expect(serials.has(COMPLETENESS_SERIAL)).toBe(true);
    expect(bookedSerials.has(COMPLETENESS_SERIAL)).toBe(false);
  });
});
