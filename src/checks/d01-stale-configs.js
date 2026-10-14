import { active, ref } from "../lib/entities.js";
import { daysSince, isoDate } from "../lib/time.js";

const CONFIG_REASONS = {
  STALE_PROBABLY_DEAD_CHECK: {
    text: "no checks in the last 30 days",
    action: "Confirm no code still reads it, then archive it.",
  },
  STALE_PROBABLY_LAUNCHED: {
    text: "probably launched",
    action: "Make the value everyone gets the default, remove the rules, and archive the config once code no longer reads it.",
  },
  STALE_PROBABLY_UNLAUNCHED: {
    text: "probably never launched",
    action: "Remove the unused rules, or archive the config if code no longer reads it.",
  },
  STALE_PROBABLY_FORGOTTEN: {
    text: "a partial rollout that looks forgotten",
    action: "Finish the rollout or roll it back, or mark the config permanent if the split is on purpose.",
  },
  STALE_NO_RULES: {
    text: "no rules, so everyone gets the default value",
    action: "If the default value is all code needs, move it into code and archive the config.",
  },
};

export default {
  id: "D01",
  title: "Dynamic configs Statsig marked stale",
  what: "Dynamic configs that are not archived and whose type is STALE, with Statsig's reason and the days since the last change.",
  severity: "medium",
  appliesTo: ["dynamicConfig"],
  requires: ["dynamicConfigs"],
  rationale:
    "Statsig marks a dynamic config stale when it looks unused or settled. A settled config is a remote switch nobody flips, read on every call.",
  action: "Follow the action for each reason, or mark the config permanent if it must stay.",
  overlap:
    "Reuses Statsig's stale flag and reason from its nightly job. A config the job has not processed yet reads as temporary, so new configs are not covered.",
  run(snapshot, config, now) {
    const staleSince = new Map();
    for (const log of snapshot.auditLogs || []) {
      if (log.actionType !== "dynamic_config_stale_status_update" || typeof log.timestamp !== "number") continue;
      const prev = staleSince.get(log.name);
      if (prev === undefined || log.timestamp > prev) staleSince.set(log.name, log.timestamp);
    }
    const findings = [];
    for (const dc of active(snapshot, "dynamicConfig")) {
      if (dc.type !== "STALE") continue;
      const reason = CONFIG_REASONS[dc.typeReason];
      const age = daysSince(now, dc.lastModifiedTime);
      const parts = [`Marked stale: ${reason ? reason.text : `reason ${dc.typeReason || "not given"}`}.`];
      if (age !== null) parts.push(`Last changed ${age} days ago.`);
      const marked = staleSince.get(dc.id) ?? (dc.name ? staleSince.get(dc.name) : undefined);
      if (marked !== undefined) parts.push(`Statsig marked it stale on ${isoDate(marked)}.`);
      findings.push({ entity: ref("dynamicConfig", dc), message: parts.join(" "), action: reason?.action });
    }
    return findings;
  },
};
