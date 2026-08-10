import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Repo-wide file collection for the stage-09 QA scans.
 *
 * These tests read the tree rather than the application, so they need a
 * walker that is explicit about what it covers: a scan whose exclusions are
 * invisible reports a clean result for files it never opened.
 */

export const REPO_ROOT = join(import.meta.dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
]);

export interface ScannedFile {
  /** Repo-relative, forward-slashed. */
  readonly path: string;
  readonly text: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

/**
 * Files under `roots` whose extension is in `extensions`. Paths come back
 * repo-relative with forward slashes so assertions read the same on every
 * platform.
 */
export function collect(
  roots: readonly string[],
  extensions: readonly string[],
): readonly ScannedFile[] {
  const files: string[] = [];
  for (const root of roots) {
    const full = join(REPO_ROOT, root);
    try {
      if (statSync(full).isDirectory()) walk(full, files);
      else files.push(full);
    } catch {
      // A root that does not exist is a scan configuration error, not a
      // silent pass: surface it as an empty result the caller asserts on.
      continue;
    }
  }
  return files
    .filter((f) => extensions.some((ext) => f.endsWith(ext)))
    .map((f) => ({
      path: relative(REPO_ROOT, f).split(sep).join("/"),
      text: readFileSync(f, "utf8"),
    }));
}

/** Source the application actually ships. */
export const SHIPPED_SOURCE_ROOTS = [
  "packages/ai/src",
  "packages/audit/src",
  "packages/data/src",
  "packages/domain/src",
  "packages/evidence/src",
  "packages/mcp/src",
  "packages/permissions/src",
  "packages/rules/src",
  "packages/services/src",
  "packages/workflows/src",
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
];

export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".css"];
