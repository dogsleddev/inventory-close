import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Locked-baseline firewall: no canonical financial figure may appear as a
 * literal anywhere in the web app's source. Every figure must arrive from
 * @icg/services at render time — if one of these strings shows up in
 * app/, components/, or lib/, someone hard-coded a total.
 */

const FORBIDDEN = [
  // Workpaper-scale strings
  "4,800,000",
  "4,812,450",
  "12,450",
  "198,950",
  "255,650",
  // All seven blocker exposures, not only the five the Overview lists
  "92,400",
  "27,600",
  "27,000",
  "18,750",
  "14,800",
  "9,200",
  // Stage 06: count population and the KE-E2 unit cost behind EXC-001
  "1,065",
  "1,061",
  "7,400",
  // Stage 07: the 1290 reserve balance and the PBC package counts
  "54,000",
  "17 of 21",
  "17/21",
  // Overview-scale strings
  "81.4",
  "80.95",
  "91.67",
  "53.33",
  "$4.80M",
  "$4.812M",
  // Integer cents / bps literals
  "480000000",
  "481245000",
  "1245000",
  "19895000",
  "25565000",
  "9240000",
  "2760000",
  "2700000",
  "1875000",
  "1480000",
  "920000",
  "5400000",
  "8142",
  "8095",
  "9167",
];

const ROOTS = ["app", "components", "lib"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|css|mjs)$/.test(name) ? [full] : [];
  });
}

describe("no hard-coded canonical totals in the web app", () => {
  const files = ROOTS.flatMap((root) => walk(join(import.meta.dirname, "..", root)));

  it("scans a meaningful surface", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const forbidden of FORBIDDEN) {
    it(`never embeds "${forbidden}"`, () => {
      const offenders = files.filter((f) =>
        readFileSync(f, "utf8").includes(forbidden),
      );
      expect(offenders).toEqual([]);
    });
  }
});
