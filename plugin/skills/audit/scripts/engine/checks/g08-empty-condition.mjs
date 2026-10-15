// Generated from src/checks/g08-empty-condition.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { allConditions, conditionValues, ref, ruleLabel } from "../lib/entities.mjs";

const NO_VALUE_OPERATORS = new Set(["is_null", "is_not_null"]);
const REFERENCE_TYPES = new Set(["passes_gate", "fails_gate", "passes_segment", "fails_segment"]);
// Operators that pass when the value is NOT in the list. With an empty list they pass everyone.
const NEGATIVE_OPERATORS = new Set(["none", "none_case_sensitive", "str_contains_none", "array_contains_none", "not_array_contains_all"]);

export function meaningfulValues(condition) {
  return conditionValues(condition).filter((v) => !(v === null || v === undefined || (typeof v === "string" && v.trim() === "")));
}

/** "the email condition (any)", "the custom field store_id condition (any)" */
export function describeCondition(condition) {
  const field = condition.type === "custom_field" && condition.field ? `custom field ${condition.field}` : condition.type;
  return `the ${field} condition${condition.operator ? ` (${condition.operator})` : ""}`;
}

export default {
  id: "G08",
  title: "Conditions with no values",
  what: "Conditions whose value list is empty or holds only blank strings, in rules that still decide something: In Progress gates, enabled dynamic configs, rule-based segments and the inline targeting of active or draft experiments. Public conditions and is_null or is_not_null operators are skipped.",
  severity: "high",
  appliesTo: ["gate", "dynamicConfig", "segment", "experiment"],
  requires: ["gates"],
  rationale:
    "A condition with an empty value list does not fail loudly. An \"any of\" condition with no values matches nobody, and a \"none of\" condition with no values matches everybody. The rule looks like targeting in the console and does something else.",
  action: "Add the values the rule was meant to target, or delete the condition.",
  overlap: "Statsig does not flag this.",
  run(snapshot) {
    const findings = [];
    for (const { type, entity, rule, ruleIndex, condition } of allConditions(snapshot)) {
      if (!condition.type || condition.type === "public") continue;
      if (condition.operator && NO_VALUE_OPERATORS.has(condition.operator)) continue;
      if (meaningfulValues(condition).length > 0) continue;
      let effect;
      if (REFERENCE_TYPES.has(condition.type)) effect = `names no ${condition.type.endsWith("gate") ? "gate" : "segment"}`;
      else if (NEGATIVE_OPERATORS.has(condition.operator)) effect = "has no values, so it matches every user";
      else effect = "has no values, so it matches no user";
      findings.push({
        entity: ref(type, entity),
        message: `In ${ruleLabel(rule, ruleIndex)}, ${describeCondition(condition)} ${effect}.`,
      });
    }
    return findings;
  },
};
