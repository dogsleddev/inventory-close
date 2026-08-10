import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pass-2 regression: the three-noun wording pact.
 *
 * The stage-10 verification established that conclusions are never
 * attributed to software: figures, statuses and citations are read from
 * tool results; conclusions are recorded by people. The Ask Gaurd
 * availability note and the User Guide boundary copy share the three-noun
 * wording, and guardrails.ts declares "the two must not drift apart again"
 * — a pact previously held by comment only. This test holds it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const THREE_NOUN = "Every figure, status and citation";
const FOUR_NOUN = /figure,\s+status,\s+conclusion\s+and\s+citation/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|md)$/.test(name)) out.push(full);
  }
  return out;
}

describe("the three-noun wording pact", () => {
  it("ships the three-noun sentence on both pact surfaces", () => {
    expect(read("apps/web/components/UserGuideScreen.tsx")).toContain(THREE_NOUN);
    expect(read("packages/ai/src/guardrails.ts")).toContain(THREE_NOUN);
  });

  it("keeps the four-noun attribution out of every shipped surface", () => {
    const roots = [
      join(repoRoot, "apps", "web", "app"),
      join(repoRoot, "apps", "web", "components"),
      join(repoRoot, "apps", "web", "lib"),
      join(repoRoot, "packages", "ai", "src"),
    ];
    const files = roots.flatMap((r) => walk(r));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      expect(FOUR_NOUN.test(readFileSync(file, "utf8")), file).toBe(false);
    }
    expect(FOUR_NOUN.test(read("README.md")), "README.md").toBe(false);
  });
});
