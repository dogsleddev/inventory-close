import type { EvidenceSensitivity } from "@icg/domain";
import { canReadContent } from "@icg/permissions";
import type { DemoUser } from "@icg/data";

/**
 * The single restricted-content redactor.
 *
 * An evidence item carries the retrieved value TWICE — `content` and
 * `originalValue` — and the fixture pipeline is an IDENTITY transformation,
 * so the two are byte-identical. Clearing one and spreading the other
 * discloses the whole payload. That bug shipped in stage 04 and was found in
 * stage 08 by the adversarial suite; it then turned out to exist in a SECOND
 * copy of the redactor in commands.ts, which the first fix missed.
 *
 * So there is now exactly one redactor and every return path calls it. If a
 * third copy of the retrieved value is ever added to an evidence shape, this
 * is the one place that has to learn about it.
 *
 * The HASHES are deliberately preserved: they disclose nothing, and lineage
 * integrity depends on them.
 */
export function redactRestricted<
  T extends {
    readonly sensitivity: EvidenceSensitivity;
    readonly content?: unknown;
    readonly originalValue?: unknown;
  },
>(user: DemoUser, item: T): T {
  if (canReadContent(user, item.sensitivity)) return item;
  return { ...item, content: undefined, originalValue: undefined };
}
