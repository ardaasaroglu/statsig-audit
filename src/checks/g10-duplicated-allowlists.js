import { allConditions, cmp, conditionValues, ENTITY_LABELS, listText, ref } from "../lib/entities.js";

const LIST_TYPES = new Set(["user_id", "email", "unit_id", "custom_field"]);
const LIST_OPERATORS = new Set(["any", "none", "any_case_sensitive", "none_case_sensitive"]);

export default {
  id: "G10",
  title: "The same ID list pasted into several entities",
  what: "The same set of at least allowlistMinSize user_id, email, unit_id or custom field values, compared without case or order, used in any or none conditions of two or more different entities.",
  settings: ["allowlistMinSize"],
  severity: "medium",
  appliesTo: ["gate", "dynamicConfig", "segment", "experiment"],
  requires: ["gates"],
  rationale:
    "When the same list of users is pasted into several rules, the copies drift: someone is added to one and not the others. A segment keeps one list that every rule references.",
  action: "Create an ID list segment with these values and replace each inline list with a passes_segment condition.",
  overlap: "Statsig does not flag this.",
  run(snapshot, config) {
    const minSize = config.thresholds.allowlistMinSize;
    const groups = new Map();
    for (const { type, entity, condition } of allConditions(snapshot)) {
      if (!LIST_TYPES.has(condition.type) || !LIST_OPERATORS.has(condition.operator)) continue;
      const values = [...new Set(conditionValues(condition).filter((v) => typeof v === "string" || typeof v === "number").map((v) => String(v).trim().toLowerCase()).filter(Boolean))].sort();
      if (values.length < minSize) continue;
      const key = JSON.stringify([condition.type, condition.field || "", values]);
      if (!groups.has(key)) groups.set(key, { type: condition.type, field: condition.field, count: values.length, members: new Map() });
      const memberKey = `${type}:${entity.id}`;
      if (!groups.get(key).members.has(memberKey)) groups.get(key).members.set(memberKey, { type, entity });
    }
    const findings = [];
    for (const group of groups.values()) {
      if (group.members.size < 2) continue;
      const members = [...group.members.values()].sort((a, b) => cmp(`${a.type}:${a.entity.id}`, `${b.type}:${b.entity.id}`));
      const [first, ...rest] = members;
      const what = group.type === "custom_field" && group.field ? `custom field "${group.field}"` : group.type;
      findings.push({
        entity: ref(first.type, first.entity),
        related: rest.map((m) => ref(m.type, m.entity)),
        message: `The same ${group.count} ${what} values also appear in ${listText(rest.map((m) => `${ENTITY_LABELS[m.type]} ${m.entity.id}`))}.`,
      });
    }
    return findings;
  },
};
