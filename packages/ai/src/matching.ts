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
 * The singular and plural of one word.
 *
 * Number agreement was the second `\b`: a property every phrase needed, that
 * only held where an author remembered to type it, and whose absence was
 * invisible in a diff. A census over the shipped table found **36 phrases
 * declared in both numbers and 198 in one** — so "Which account is out?"
 * answered and "Which accounts are out?" refused, "Is the third-party
 * confirmation in?" reached the handler that names the $92,400 outstanding
 * confirmation while "Are all third-party confirmations in?" was claimed by
 * the custody handler and reported `missingEvidence: []`, and — the P0 —
 * "price variance" reached the price-variance intent while "price variances"
 * fell through to the physical-count handler, which answered a purchasing
 * question with "1,061 of 1,065 units matched on the first pass".
 *
 * That last one is worth naming precisely, because it looks like the defect
 * class §3.9 closed and is not. The ordering invariant held: price-variance
 * is intent #8 and counts is #32, so "price variance" does beat "variance".
 * Ordering never got to arbitrate, because the price-variance spec did not
 * match the plural at all. An enumerated allowlist standing in for a
 * category, which is the same shape as an enumerated denylist.
 *
 * So the author declares the noun and the compiler declares its number, the
 * way the author declares the phrase and the compiler declares the
 * boundaries. Both forms are generated from either input, because the table
 * contains phrases written in the plural too (`weightings`, `dispositions`)
 * and a reader may ask those in the singular.
 *
 * Only regular inflection is generated. An irregular noun still needs its
 * second form written out, and a verb tense is not number and is not touched
 * here — those stay the author's job, and a stem marker exists for them.
 */
/**
 * Words that take no number, because they are not nouns.
 *
 * `numberForms` was applied to the last segment of every phrase unconditionally,
 * and the docstring above claims the last segment "is the head noun in every
 * phrase this table declares". It is not: the table ends phrases in pronouns
 * ("not ours"), prepositions ("makes up the cost of") and particles. Inflecting
 * those widens a phrase into questions the intent was never written for —
 * `not ours` became `not (?:ours|our)`, so "Is the reserve not our decision to
 * make?" and "Why is the write-down not our call?" were both claimed by the
 * consignment handler and answered with twelve vendor-owned units.
 *
 * A closed list rather than a part-of-speech test: the vocabulary is small,
 * enumerable, and an unknown word should inflect. `routing-identity.test.ts`
 * asserts the reader-facing consequence from hand-authored English rather than
 * from this list, so the list being incomplete fails a test rather than
 * widening a phrase.
 */
const UNINFLECTED = new Set([
  "ours", "our", "yours", "theirs", "its", "his", "hers", "mine",
  "this", "that", "these", "those", "each", "any", "some", "all", "no",
  "of", "to", "on", "in", "at", "by", "for", "from", "up", "off", "out",
  "with", "into", "over", "under", "and", "or", "not", "is", "are", "was",
  "were", "be", "been", "has", "have", "had", "do", "does", "did",
]);

export function numberForms(word: string): readonly string[] {
  if (UNINFLECTED.has(word)) return [word];
  const forms = new Set<string>([word]);
  if (/[^aeiou]ies$/.test(word)) forms.add(`${word.slice(0, -3)}y`);
  else if (/(?:[sxz]|ch|sh)es$/.test(word)) forms.add(word.slice(0, -2));
  else if (/[^su]s$/.test(word)) forms.add(word.slice(0, -1));
  else if (/(?:s|x|z|ch|sh)$/.test(word)) forms.add(`${word}es`);
  else if (/[^aeiou]y$/.test(word)) forms.add(`${word.slice(0, -1)}ies`);
  else forms.add(`${word}s`);
  // Longest first: the alternation is ordered, and preferring the longer form
  // saves the engine a backtrack against the `\b` that follows it.
  return [...forms].sort((a, b) => b.length - a.length);
}

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
 *
 * The split is on `[\s-]+` too, and that is the half that was missing. Splitting
 * on whitespace alone made the join one-directional: an authored SPACE matched a
 * hyphen, an authored HYPHEN matched nothing else. `"sub-ledger"` compiled to
 * `/\b(?:sub-ledgers|sub-ledger)\b/`, so "What is in the sub ledger?" refused
 * while "What is in the sub-ledger?" answered. Seven other hyphenated phrases
 * looked fine only because an author had hand-listed the spaced twin beside
 * them — a hand-maintained allowlist standing in for a compiler property, which
 * is the same shape number agreement removed one axis over. Splitting on the
 * same class it joins on makes the property symmetric by construction, and
 * inflection still lands on the head noun because the last SEGMENT is the last
 * element either way.
 *
 * The phrase is folded by `normalizeQuestion` — the same function the question
 * goes through, not a second spelling of it. Folding one side and not the other
 * meant a phrase authored with a curly apostrophe compiled to a pattern no
 * normalized question could match, and nothing said so: every assertion in the
 * phrase-property suite tests a pattern against the phrase that produced it, so
 * all of them pass on a phrase that matches nothing a reader can type.
 * `routing-identity.test.ts` additionally requires every phrase to be ASCII,
 * which is what catches the corruption folding cannot undo.
 */
export function phrasePattern(phrase: string): RegExp {
  const stem = phrase.endsWith(STEM);
  const literal = normalizeQuestion(stem ? phrase.slice(0, -STEM.length) : phrase);
  const words = literal.split(/[\s-]+/).filter((w) => w !== "");
  if (words.length === 0) {
    throw new Error("An intent phrase must contain at least one word");
  }
  /**
   * Only the LAST word takes both numbers. It is the head noun in every
   * phrase this table declares ("price variance", "which account", "accrued
   * liability", "required component"), and inflecting the modifiers as well
   * would widen each phrase by a factor per word for no reader.
   *
   * A stem already matches its own inflections, so it is left alone: adding
   * number forms under `[a-z]*` would be a second spelling of the same rule.
   */
  const body = words
    .map((word, i) =>
      i === words.length - 1 && !stem
        ? `(?:${numberForms(word).map(escapeLiteral).join("|")})`
        : escapeLiteral(word),
    )
    .join("[\\s-]+");
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
