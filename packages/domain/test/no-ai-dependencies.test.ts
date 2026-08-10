import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Architecture guard: packages/domain (and packages/rules) form the
 * deterministic core and must have zero AI dependencies — no AI SDK in
 * package.json, no AI import in any source file, and no dependency on
 * @icg/ai or on any other @icg package (domain sits at the bottom of the
 * dependency direction).
 */

const AI_PACKAGE_PATTERNS = [
  /^@anthropic-ai\//,
  /^openai$/,
  /^openai\//,
  /^ai$/,
  /^ai\//,
  /^@ai-sdk\//,
  /^langchain/,
  /^@langchain\//,
  /^@google\/generative-ai/,
  /^@google\/genai/,
  /^@google-cloud\/vertexai/,
  /^@aws-sdk\/client-bedrock/,
  /^@mistralai\//,
  /^cohere-ai/,
  /^groq-sdk/,
  /^ollama$/,
  /^ollama\//,
  /^together-ai/,
  /^@huggingface\/inference/,
  /^replicate$/,
  /^@icg\/ai$/,
  /^@icg\/ai\//,
];

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function dependencyNames(packageDir: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function importedModules(filePath: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const modules: string[] = [];
  // `from "x"` / dynamic import("x") / side-effect `import "x"` / require("x").
  const importRes = [
    /from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of importRes) {
    for (const match of content.matchAll(re)) {
      if (match[1] !== undefined) {
        modules.push(match[1]);
      }
    }
  }
  return modules;
}

describe.each(["domain", "rules"])(
  "packages/%s deterministic-core guard",
  (pkg) => {
    const packageDir = join(repoRoot, "packages", pkg);

    it("declares no AI packages in package.json", () => {
      const offending = dependencyNames(packageDir).filter((name) =>
        AI_PACKAGE_PATTERNS.some((pattern) => pattern.test(name)),
      );
      expect(offending).toEqual([]);
    });

    it("imports no AI modules from source", () => {
      const offending = sourceFiles(join(packageDir, "src")).flatMap((file) =>
        importedModules(file).filter((specifier) =>
          AI_PACKAGE_PATTERNS.some((pattern) => pattern.test(specifier)),
        ),
      );
      expect(offending).toEqual([]);
    });

    it("never escapes its own package via relative imports", () => {
      // A "../../other-package/src/x.js" import bypasses no-restricted-imports
      // entirely; every relative specifier must resolve inside the package.
      const offending = sourceFiles(join(packageDir, "src")).flatMap((file) =>
        importedModules(file)
          .filter((specifier) => specifier.startsWith("."))
          .filter((specifier) => {
            const resolved = join(file, "..", specifier);
            return !resolved.startsWith(packageDir);
          })
          .map((specifier) => `${file} -> ${specifier}`),
      );
      expect(offending).toEqual([]);
    });
  },
);

describe("packages/rules dependency allowlist", () => {
  // The enumerated AI pattern list can never be complete; this allowlist is
  // the backstop — ANY new runtime dependency fails until reviewed.
  it("has @icg/domain as its only runtime dependency", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages", "rules", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["@icg/domain"]);
  });
});

describe("packages/domain sits at the bottom of the dependency direction", () => {
  const domainDir = join(repoRoot, "packages", "domain");

  it("depends on no other @icg package", () => {
    const offending = dependencyNames(domainDir).filter((name) =>
      name.startsWith("@icg/"),
    );
    expect(offending).toEqual([]);
  });

  it("imports no @icg module from source", () => {
    const offending = sourceFiles(join(domainDir, "src")).flatMap((file) =>
      importedModules(file).filter((specifier) =>
        specifier.startsWith("@icg/"),
      ),
    );
    expect(offending).toEqual([]);
  });

  it("has zod as its only runtime dependency", () => {
    const manifest = JSON.parse(
      readFileSync(join(domainDir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["zod"]);
  });
});
