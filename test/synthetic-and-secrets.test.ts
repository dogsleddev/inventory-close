import { describe, expect, it } from "vitest";
import { buildDataset } from "@icg/data";
import { collect, SHIPPED_SOURCE_ROOTS, SOURCE_EXTENSIONS } from "./repo-scan";

/**
 * Stage 09 — "no real-company data / no secrets" (prompt 09, docs/14).
 *
 * A P0 release failure is real or confidential data exposure. Two checks:
 * nothing in the tree looks like a credential, and every party the product
 * names is one the synthetic dataset invented. The second is the one that
 * would actually go wrong — a plausible vendor or customer name typed into
 * a fixture reads as real to anyone who does not know the dataset.
 */

const dataset = buildDataset();
const source = collect(SHIPPED_SOURCE_ROOTS, SOURCE_EXTENSIONS);

/**
 * Configuration files, enumerated by exact path. The first version of this
 * list named `eslint.config.js` and `apps/web/next.config.ts` — neither
 * exists (the real files are `.mjs`) — and `collect()` swallowed the miss,
 * so half the credential scan silently covered nothing while two public
 * documents claimed it covered everything. Hence the existence assertion
 * below: a renamed config must fail this file, never fall out of it.
 */
const CONFIG_ROOTS = [
  "package.json",
  "vitest.config.ts",
  "eslint.config.mjs",
  "apps/web/next.config.mjs",
  "apps/web/vercel.json",
  ".env.example",
  ".gitattributes",
];
const config = collect(CONFIG_ROOTS, [".json", ".ts", ".js", ".mjs", ".example", ".gitattributes"]);

const files = [...source, ...config];

describe("the config half of the scan covers what it names", () => {
  it("resolves every enumerated config root", () => {
    for (const root of CONFIG_ROOTS) {
      expect(
        config.some((f) => f.path === root),
        `${root} did not resolve — the credential scan silently lost a file it claims to cover`,
      ).toBe(true);
    }
  });
});

function scan(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    for (const match of file.text.matchAll(pattern)) {
      found.push(`${file.path}: ${match[0].slice(0, 60)}`);
    }
  }
  return found;
}

describe("nothing in the tree is a credential", () => {
  const SECRET_SHAPES: readonly { name: string; pattern: RegExp }[] = [
    { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { name: "bearer token literal", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/g },
    { name: "Anthropic-style key", pattern: /\bsk-[A-Za-z0-9-]{20,}/g },
    { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
    { name: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
    {
      name: "assigned secret",
      // `apiKey = "..."` with a real-looking value. Empty strings and
      // obvious placeholders are not credentials.
      pattern:
        /\b(?:api[_-]?key|secret|password|token|credential)s?\s*[:=]\s*["'`](?!\s*["'`])[^"'`\n]{12,}["'`]/gi,
    },
  ];

  for (const { name, pattern } of SECRET_SHAPES) {
    it(`contains no ${name}`, () => {
      expect(scan(pattern)).toEqual([]);
    });
  }

  it("binds no AI provider and reads no provider credential", () => {
    // The close works with AI off because there is nothing to turn on:
    // no provider SDK is imported and no key is read anywhere. ONE file may
    // name the SDKs: eslint.config.mjs, which bans them — the enforcement
    // site is exempted by exact path so a dependency added to any
    // package.json still trips the scan.
    const enforcementSite = "eslint.config.mjs";
    const hits = (pattern: RegExp) =>
      scan(pattern).filter((h) => !h.startsWith(`${enforcementSite}:`));
    expect(hits(/process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN)/g)).toEqual([]);
    expect(hits(/@anthropic-ai\/|\bopenai\b/gi)).toEqual([]);
    // And the exemption itself must stay a ban, not become an import.
    const eslintConfig = files.find((f) => f.path === enforcementSite);
    expect(eslintConfig?.text).toMatch(/no-restricted|paths|patterns/);
    expect(eslintConfig?.text).not.toMatch(/from\s+["']@anthropic-ai\//);
  });
});

describe("every party the product names is one the dataset invented", () => {
  const invented = new Set(dataset.parties.map((p) => p.name));
  const inventedIds = new Set(dataset.parties.map((p) => p.id));

  it("has a synthetic company and counterparties", () => {
    expect(invented.size).toBeGreaterThan(3);
    // The company itself is fictional and stated as such in the shell.
    expect(source.some((f) => f.text.includes("KESTRELGRID AI"))).toBe(true);
    expect(source.some((f) => f.text.includes("SYNTHETIC DEMO"))).toBe(true);
  });

  it("names no real-world company, domain or contact address", () => {
    // Any email address at all would be a contact detail this product has
    // no reason to carry.
    expect(scan(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)).toEqual([]);
    // Outbound URLs, likewise: this product fetches nothing.
    expect(
      scan(/\bhttps?:\/\/(?!localhost|127\.0\.0\.1)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g),
    ).toEqual([]);
    // NetSuite is named deliberately — it is the system of record this
    // product sits beside — and every NetSuite record here is generated.
    // Every OTHER party named in a fixture must come from the dataset's own
    // invented cast.
    const vendors = dataset.purchaseOrders.map((po) => po.vendor);
    const customers = dataset.salesOrders.map((so) => so.customer);
    expect(vendors.length + customers.length).toBeGreaterThan(0);
    for (const party of [...vendors, ...customers]) {
      expect(inventedIds.has(party) || invented.has(party), `${party} is not a dataset party`)
        .toBe(true);
    }
  });

  it("discloses the synthetic nature where a reader would carry the package away", () => {
    const manifest = source.find((f) => f.path.endsWith("lib/server/integrity-view.ts"));
    expect(manifest?.text).toMatch(/synthetic/i);
    expect(manifest?.text).toMatch(/fictional company/i);
  });
});
