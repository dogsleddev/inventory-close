/**
 * Deterministic presentation formatting (stage 05). Pure string shaping of
 * values that arrive from @icg/services — no arithmetic beyond unit
 * conversion, no rounding that could invent a figure. Dates render in UTC
 * so the same dataset renders identically on every machine.
 */

const MONTHS = [
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec.",
] as const;

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Integer cents → workpaper-scale dollars ("$1,234,567"). Accounting
 * negatives render in parentheses: -123400 → "($1,234)". Non-whole-dollar
 * amounts keep their cents rather than silently rounding.
 */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body =
    rem === 0
      ? `$${group(String(dollars))}`
      : `$${group(String(dollars))}.${String(rem).padStart(2, "0")}`;
  return negative ? `(${body})` : body;
}

/**
 * Overview-scale millions ("$1.23M" at 2dp, "$1.234M" at 3dp) — the
 * documented dual-scale numeric rule from the design system.
 */
export function formatCentsMillions(cents: number, decimals: number): string {
  const millions = cents / 100 / 1_000_000;
  return `$${millions.toFixed(decimals)}M`;
}

/**
 * A count, grouped. Fourteen call sites write `n.toLocaleString("en-US")`
 * inline and produce exactly this; naming it here gives them somewhere to
 * converge and gives Ask Gaurd — which had been rendering `String(count)` —
 * the same grouping the screens use. A book population printed as `1500`
 * beside a screen printing `1,500` is one figure in two spellings.
 */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Basis points at overview scale, one decimal (the documented rounding rule). */
export function formatBpsOverview(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/** Basis points at workpaper scale, two decimals (1234 → "12.34%"). */
export function formatBpsExact(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Score hundredths: 9000 → "90%", 1234 → "12.34%" (integers stay terse). */
export function formatScoreHundredths(hundredths: number): string {
  const pct = hundredths / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}

function parts(iso: string): { y: number; m: number; d: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** "2026-12-27…" → "Dec. 27, 2026" (UTC date part, deterministic). */
export function formatDate(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

/** "2026-12-27…" → "Dec. 27" for dense timelines. */
export function formatDateShort(iso: string): string {
  const p = parts(iso);
  if (!p) return iso;
  return `${MONTHS[p.m - 1]} ${p.d}`;
}

/** Full instant in UTC: "2026-12-29T17:41:00Z" → "Dec. 29, 2026 17:41 UTC". */
export function formatInstant(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m || m[1] === undefined) return iso;
  return `${formatDate(m[1])} ${m[2]}:${m[3]} UTC`;
}

/** Truncate a sha-256 for display: "f0b98684…" (never for comparison). */
export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}
