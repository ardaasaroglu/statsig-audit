// Generated from src/checks/g11-unreachable-rules.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { isAllEnvironments, isEveryoneRule, listText, plural, ref, ruleLabel, ruleSets } from "../lib/entities.mjs";

export default {
  id: "G11",
  title: "Rules that can never run",
  what: "In gates, dynamic configs and experiment targeting, a rule with no conditions or only public conditions, applied in every environment, that is not the last rule. Every rule after it is unreachable.",
  severity: "medium",
  appliesTo: ["gate", "dynamicConfig", "experiment"],
  requires: ["gates"],
  rationale:
    "Statsig evaluates rules top to bottom and applies the first match. A rule that matches everyone, at any pass percentage, ends the list for every user, so the rules below it never run. Someone reading the console will believe they do.",
  action: "Move the everyone rule to the bottom, or delete the rules below it.",
  overlap: "Statsig does not flag this.",
  run(snapshot) {
    const findings = [];
    for (const { type, entity, rules } of ruleSets(snapshot)) {
      if (type === "segment") continue;
      const index = rules.findIndex((r) => isEveryoneRule(r) && isAllEnvironments(r));
      if (index === -1 || index === rules.length - 1) continue;
      const shadowed = rules.slice(index + 1).map((r, i) => ruleLabel(r, index + 1 + i));
      const tail = shadowed.length === 1 ? "the rule after it never runs" : `the ${plural(shadowed.length, "rule")} after it never run`;
      findings.push({
        entity: ref(type, entity),
        message: `${ruleLabel(rules[index], index).replace(/^r/, "R")} matches everyone, so ${tail}: ${listText(shadowed)}.`,
      });
    }
    return findings;
  },
};
