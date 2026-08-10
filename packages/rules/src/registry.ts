import type { RuleDefinition } from "@icg/domain";
import { isoDate, ruleId } from "@icg/domain";
import type { Rule } from "./engine/rule.js";
import { cntCc001, cntCc002, cntCc003, cntComp001, cntEx001, cntMove001, cntVar001 } from "./rules/counts.js";
import { cutIn001, cutOut001 } from "./rules/cutoff.js";
import { tpiConf001 } from "./rules/thirdParty.js";
import { ownLoan001 } from "./rules/ownership.js";
import { rmaDup001 } from "./rules/rma.js";
import { demoAge001 } from "./rules/demo.js";
import { valDmg001, valEo001 } from "./rules/valuation.js";
import { dqLoc001 } from "./rules/dataQuality.js";
import { glMan001, recGl001 } from "./rules/glReconciliation.js";
import { proc3wm001 } from "./rules/procurement.js";
import { o2cChain001, o2cInv001 } from "./rules/commercial.js";

export const RULESET_VERSION = "RULESET-v1.0.0";

/**
 * The canonical execution order. The first fifteen are the primary
 * accounting rules whose findings become EXC-001..EXC-015, in the canonical
 * exception order of CANONICAL_SPEC section 9.
 */
export const PRIMARY_RULES: readonly Rule[] = [
  cutOut001, // EXC-001
  cutIn001, // EXC-002
  cntEx001, // EXC-003
  cntComp001, // EXC-004
  cntVar001, // EXC-005
  cntMove001, // EXC-006
  tpiConf001, // EXC-007
  ownLoan001, // EXC-008
  rmaDup001, // EXC-009
  demoAge001, // EXC-010
  valEo001, // EXC-011
  valDmg001, // EXC-012
  dqLoc001, // EXC-013
  recGl001, // EXC-014
  glMan001, // EXC-015
];

export const SUPPORTING_RULES: readonly Rule[] = [
  cntCc001,
  cntCc002,
  cntCc003,
  proc3wm001,
  o2cChain001,
  o2cInv001,
];

export const ALL_RULES: readonly Rule[] = [...PRIMARY_RULES, ...SUPPORTING_RULES];

export const RULE_DEFINITIONS: readonly RuleDefinition[] = ALL_RULES.map((r) => ({
  id: ruleId(r.id),
  version: r.version,
  controlDomain: r.controlDomain,
  title: r.id,
  effectiveFrom: isoDate("2026-01-01"),
  defaultAssertions: [],
  defaultRisk: "MEDIUM",
  inputSchemaRef: "rules/engine/input.ts#CloseInput",
  outputSchemaRef: "rules/engine/findings.ts#RuleOutput",
  codeRef: `packages/rules/src/rules`,
  docRef: "CANONICAL_SPEC.md#10-rule-registry",
}));
