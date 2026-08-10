import type { ExceptionStatus } from "@icg/domain";
import type { RuleFinding } from "./engine/findings.js";
import { PRIMARY_RULES } from "./registry.js";

/**
 * A derived exception: a primary-rule accounting finding with its canonical
 * EXC identifier and its current workflow status. IDs are assigned by the
 * canonical primary-rule order (CANONICAL_SPEC section 9 lists exceptions
 * in exactly this rule order), with findings inside one rule ordered by
 * their first subject for determinism.
 */
export interface DerivedException {
  readonly id: string;
  readonly finding: RuleFinding;
  readonly status: ExceptionStatus;
  /** Scenario events (by id) that changed this exception's state. */
  readonly resolvedByEvents: readonly string[];
}

function subjectSortKey(f: RuleFinding): string {
  return (
    f.subjects.serials?.[0] ??
    f.subjects.transactionNumbers?.[0] ??
    f.subjects.skus?.[0] ??
    f.subjects.custodian ??
    f.title
  );
}

export function assignExceptionIds(
  findings: readonly RuleFinding[],
): DerivedException[] {
  const primaryOrder = new Map(PRIMARY_RULES.map((r, i) => [r.id, i]));
  const accounting = findings
    .filter((f) => f.kind === "ACCOUNTING_EXCEPTION" && primaryOrder.has(f.ruleId))
    .sort((a, b) => {
      const byRule = (primaryOrder.get(a.ruleId) ?? 99) - (primaryOrder.get(b.ruleId) ?? 99);
      if (byRule !== 0) return byRule;
      const ka = subjectSortKey(a);
      const kb = subjectSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return accounting.map((finding, i) => ({
    id: `EXC-${String(i + 1).padStart(3, "0")}`,
    finding,
    status: finding.initialStatus,
    resolvedByEvents: [],
  }));
}
