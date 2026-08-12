/**
 * Intent matching for Ask Gaurd (COMPLETION_PLAN Stage G).
 *
 * Stage 08 wrote each intent's patterns as hand-written regexes over the
 * lower-cased question. They were unanchored substrings, and that is a defect
 * class rather than an oversight: `/count/` matched "GL **ac**count 1200" and
 * "**ac**counting impact of SO-26184", so the physical-count handler answered
 * two questions about the general ledger. COMPLETION_PLAN §3.9 blocked ~10
 * new intents on fixing it, because every intent added on top of an
 * unanchored table makes the next mis-route harder to see.
 *
 * The fix is not "add `\b` to the regexes". A boundary somebody remembered to
 * type is a boundary somebody can forget to type, and the test that would
 * catch it has to be written per pattern. Intents here declare **phrases**,
 * and the boundaries are added by the compiler — so an unanchored pattern is
 * not something an author can express. `intentPhrases` then exposes every
 * phrase in the table, and one test asserts the property over all of them at
 * once (see `routing-identity.test.ts`).
 *
 * The vocabulary is deliberately small:
 *
 * - `any` — any one phrase present routes here. Use for words that belong to
 *   one topic ("grni", "consignment").
 * - `all` — any one GROUP whose every phrase is present routes here. Use when
 *   no single word is decisive: "received" and "not invoiced" each appear all
 *   over a procurement close; together they name exactly one population.
 *
 * There is no ordering inside a group and no negation. Both were tempting and
 * both would move the disambiguation into the pattern language, where it is
 * invisible; disambiguation lives in the ORDER of the intent table, which is
 * asserted probe by probe.
 */

/** A word char as this module counts one, after normalisation. */
const WORD_CHAR = /[a-z0-9]/;

/**
 * Stem marker. `"reconcil*"` matches reconcile / reconciled / reconciliation,
 * and still may not match inside a longer word on the LEFT — which is the
 * boundary the mis-routes came from. Both boundaries are compiled in; the
 * author chooses the stem, never the anchoring.
 */
const STEM = "*";

const escapeLiteral = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Normalise a question before matching.
 *
 * Curly punctuation is folded because the phrases are written with typewriter
 * quotes and hyphens: a chip that ships "doesn't" with a typographic
 * apostrophe would otherwise route differently from the same question typed
 * into the box, and the difference is invisible in a diff.
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    // These class members are the curly characters themselves, and this file
    // is edited on Windows: a Get-Content/Set-Content round trip mojibakes
    // them, at which point folding stops silently. `routing-identity.test.ts`
    // asserts a curly-quoted question routes like its typewriter twin, so the
    // corruption fails a test rather than surviving to a demo.
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compile one phrase to a whole-word pattern.
 *
 * Words inside a phrase are joined by `[\s-]+`, so "first pass" matches
 * "first-pass" and "sign off" matches "sign-off". A close is written both
 * ways on the same screen and neither spelling is the reader's mistake.
 */
export function phrasePattern(phrase: string): RegExp {
  const stem = phrase.endsWith(STEM);
  const literal = (stem ? phrase.slice(0, -STEM.length) : phrase).toLowerCase();
  const words = literal.split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) {
    throw new Error("An intent phrase must contain at least one word");
  }
  const body = words.map(escapeLiteral).join("[\\s-]+");
  const first = literal[0] ?? "";
  const last = literal[literal.length - 1] ?? "";
  // `\b` is only a boundary next to a word character. A phrase ending in
  // punctuation with `\b` appended would assert the opposite of what the
  // author means, and would do it silently.
  const lead = WORD_CHAR.test(first) ? "\\b" : "";
  const tail = stem ? "[a-z]*\\b" : WORD_CHAR.test(last) ? "\\b" : "";
  return new RegExp(lead + body + tail);
}

export interface IntentMatch {
  /** Any one of these phrases present routes here. */
  readonly any?: readonly string[];
  /** Any one of these groups, ALL of whose phrases are present, routes here. */
  readonly all?: readonly (readonly string[])[];
}

/** Every phrase a match spec names — the population the property test walks. */
export function intentPhrases(match: IntentMatch): readonly string[] {
  return [...(match.any ?? []), ...(match.all ?? []).flat()];
}

const cache = new Map<string, RegExp>();
const patternFor = (phrase: string): RegExp => {
  const cached = cache.get(phrase);
  if (cached !== undefined) return cached;
  const compiled = phrasePattern(phrase);
  cache.set(phrase, compiled);
  return compiled;
};

/**
 * Does this match spec claim the question? `normalized` must already have
 * been through `normalizeQuestion` — taking the raw string here would let a
 * caller skip it, and the skip would only show up for one spelling.
 */
export function matchesQuestion(match: IntentMatch, normalized: string): boolean {
  if ((match.any ?? []).some((phrase) => patternFor(phrase).test(normalized))) {
    return true;
  }
  return (match.all ?? []).some(
    (group) =>
      group.length > 0 && group.every((phrase) => patternFor(phrase).test(normalized)),
  );
}

/**
 * Record identifiers a question may name, extracted so a reader can ask about
 * an object the screen is not scoped to ("What supports EXC-001?" from the
 * Evidence screen). Extraction only ever proposes a candidate — whether the
 * object exists is still established by asking the tools, never by the shape
 * of the string, which is the substitution that made the assistant deny the
 * existence of objects it was looking at.
 */
export function extractExceptionId(question: string): string | undefined {
  const hit = /\bexc-(\d{3})\b/i.exec(question);
  return hit === null ? undefined : `EXC-${hit[1]}`;
}

/**
 * A serial as the dataset spells one (`KE-E2-1048`). The SKU segment is
 * matched by shape rather than by an enumerated list of SKU families: an
 * enumerated list is the same defect as an enumerated denylist, and a new
 * family would fall out of it silently.
 */
export function extractSerial(question: string): string | undefined {
  const hit = /\b(ke-[a-z]\d-\d{3,6})\b/i.exec(question);
  return hit === null ? undefined : hit[1]!.toUpperCase();
}
