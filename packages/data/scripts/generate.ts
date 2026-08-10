/**
 * Regenerates the committed JSON fixtures in packages/data/fixtures from the
 * canonical seed. Run via `pnpm --filter @icg/data generate`. The output is
 * deterministic: same seed, same bytes.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset } from "../src/buildDataset.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");
mkdirSync(fixturesDir, { recursive: true });
// Remove stale fixtures so renamed/dropped collections cannot linger.
for (const f of readdirSync(fixturesDir)) {
  if (f.endsWith(".json")) rmSync(join(fixturesDir, f));
}

const dataset = buildDataset();
const { manifest, story, ...collections } = dataset;

for (const [name, rows] of Object.entries(collections)) {
  writeFileSync(
    join(fixturesDir, `${name}.json`),
    `${JSON.stringify(rows, null, 2)}\n`,
    "utf8",
  );
}
writeFileSync(
  join(fixturesDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

// The story serials are a convenience index for tests and demos, not a
// source-system fixture; written separately and excluded from the manifest.
writeFileSync(
  join(fixturesDir, "story.json"),
  `${JSON.stringify(story, null, 2)}\n`,
  "utf8",
);

console.log(
  `Wrote ${Object.keys(collections).length + 2} fixture files to ${fixturesDir}`,
);
console.log(`datasetHash: ${manifest.datasetHash}`);
