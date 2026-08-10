import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDataset } from "../src/buildDataset.js";

/**
 * CANONICAL_SPEC §15: same controlled inputs, same structured outputs. The
 * committed fixtures under packages/data/fixtures are the canonical output
 * of the canonical seed; regeneration must reproduce them byte-for-byte.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

describe("determinism", () => {
  it("produces identical output on repeated generation", () => {
    const a = buildDataset();
    const b = buildDataset();
    expect(a.manifest.datasetHash).toBe(b.manifest.datasetHash);
    expect(a).toEqual(b);
  });

  it("changes identity (but not control totals) under a different seed", () => {
    const canonical = buildDataset();
    const other = buildDataset("ICG-FY2026-DEMO-999");
    expect(other.manifest.datasetHash).not.toBe(canonical.manifest.datasetHash);
    expect(other.manifest.controlTotals).toEqual(canonical.manifest.controlTotals);
  });

  it("matches the committed fixture manifest exactly", () => {
    const committed = JSON.parse(readFileSync(join(fixturesDir, "manifest.json"), "utf8"));
    const regenerated = buildDataset();
    expect(regenerated.manifest).toEqual(committed);
  });

  it("matches every committed fixture collection", () => {
    const regenerated = buildDataset();
    const { manifest: _manifest, story: _story, ...collections } = regenerated;
    for (const [name, rows] of Object.entries(collections)) {
      const committed = JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8"));
      expect(rows, `fixture collection ${name}`).toEqual(committed);
    }
  });

  it("has no stale or missing fixture files", () => {
    const { manifest: _m, story: _s, ...collections } = buildDataset();
    const expected = [...Object.keys(collections), "manifest", "story"]
      .map((n) => `${n}.json`)
      .sort();
    const actual = readdirSync(fixturesDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect(actual).toEqual(expected);
  });

  it("pins the canonical serials regardless of PRNG state", () => {
    const d = buildDataset();
    const serials = new Set(d.inventoryUnits.map((u) => u.serial));
    expect(serials.has("KE-E2-1048")).toBe(true);
    expect(serials.has("KE-X1-3498")).toBe(true);
    expect(serials.has("KE-X1-8842")).toBe(false);
  });
});
