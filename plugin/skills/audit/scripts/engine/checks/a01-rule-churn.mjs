// Generated from src/checks/a01-rule-churn.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { byId, plural, ref } from "../lib/entities.mjs";
import { DAY_MS } from "../lib/time.mjs";

// Audit log actions that change what a gate or dynamic config serves.
export const RULE_CHANGE_ACTIONS = new Set([
  "gate_update",
  "config_conditions_update",
  "config_state_toggle",
  "config_default_value_update",
  "config_environments_update",
  "config_revert",
  "config_resalt",
]);

export default {
  id: "A01",
  title: "Gates and configs whose rules keep changing",
  what: "Gates and dynamic configs with at least ruleChurnMinChanges rule, state, environment or default value changes in the last ruleChurnWindowDays days of the audit log. High when the entity's own review setting is off and the project setting does not require reviews.",
  settings: ["ruleChurnWindowDays", "ruleChurnMinChanges"],
  severity: "medium",
  appliesTo: ["gate", "dynamicConfig"],
  requires: ["auditLogs", "gates"],
  rationale:
    "Many rule changes in a few days usually means the gate is being used to steer a live incident or tuned by hand. Each change is a production change, and without review one wrong edit reaches every user. High when neither the entity nor the project requires a review.",
  action: "Find out why it keeps changing. Turn on required reviews for it, and move values that are tuned often into a dynamic config.",
  overlap: "Statsig records every change in the audit log. It does not flag frequent changes.",
  run(snapshot, config, now) {
    const { ruleChurnWindowDays: windowDays, ruleChurnMinChanges: minChanges } = config.thresholds;
    const since = now - windowDays * DAY_MS;
    const gates = byId(snapshot.gates);
    const configs = byId(snapshot.dynamicConfigs);
    const byName = (map) => {
      const out = new Map();
      for (const e of map.values()) if (e.name && !out.has(e.name)) out.set(e.name, e);
      return out;
    };
    const gateNames = byName(gates);
    const configNames = byName(configs);
    const counts = new Map();
    for (const log of snapshot.auditLogs || []) {
      if (!RULE_CHANGE_ACTIONS.has(log.actionType) || typeof log.timestamp !== "number") continue;
      if (log.timestamp <= since || log.timestamp > now) continue;
      let type = null;
      let entity = null;
      for (const [t, ids, names] of [["gate", gates, gateNames], ["dynamicConfig", configs, configNames]]) {
        entity = ids.get(log.name) || names.get(log.name) || null;
        if (entity) {
          type = t;
          break;
        }
      }
      if (!entity) continue;
      const key = `${type}:${entity.id}`;
      if (!counts.has(key)) counts.set(key, { type, entity, changes: 0, people: new Set() });
      const c = counts.get(key);
      c.changes++;
      if (log.updatedByUserID || log.updatedBy) c.people.add(log.updatedByUserID || log.updatedBy);
    }
    const projectReview = snapshot.reviewSettings?.is_config_review_required;
    const findings = [];
    for (const { type, entity, changes, people } of counts.values()) {
      if (changes < minChanges) continue;
      const unreviewed = projectReview === false && entity.reviewSettings?.requiredReview === false;
      findings.push({
        severity: unreviewed ? "high" : "medium",
        entity: ref(type, entity),
        message: `${plural(changes, "rule or state change")} in the last ${windowDays} days, by ${plural(people.size, "person", "people")}.${unreviewed ? " Its own review setting is off and the project does not require reviews." : ""}`,
      });
    }
    return findings;
  },
};
