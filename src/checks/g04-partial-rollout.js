import { active, listText, ref, ruleLabel } from "../lib/entities.js";
import { daysSince } from "../lib/time.js";

export default {
  id: "G04",
  title: "Partial rollouts left alone",
  what: "In Progress gates, not permanent and not marked stale, unchanged for at least partialRolloutDays, with a rule that passes more than 0% and less than 100% and has no pending automated rollout step.",
  settings: ["partialRolloutDays"],
  severity: "medium",
  appliesTo: ["gate"],
  requires: ["gates"],
  rationale:
    "A rule that passes between 0% and 100% with no scheduled next step usually means a rollout someone meant to finish. Some users get the new path and some do not, for no reason anyone remembers.",
  action: "Finish the rollout to 100% or roll it back to 0%, then launch or disable the gate. If the split is on purpose, mark the gate permanent or add it to the ignore list.",
  overlap:
    "Statsig calls this STALE_PROBABLY_FORGOTTEN, but skips gates that other entities reference and gates the nightly job has not classified. Gates already marked stale are left to G01. Rules with a pending automated rollout step are skipped.",
  run(snapshot, config, now) {
    const limit = config.thresholds.partialRolloutDays;
    const findings = [];
    for (const gate of active(snapshot, "gate")) {
      if (gate.status !== "In Progress" || gate.type === "STALE" || gate.type === "PERMANENT") continue;
      const age = daysSince(now, gate.lastModifiedTime);
      if (age === null || age < limit) continue;
      const partial = [];
      (gate.rules || []).forEach((rule, i) => {
        const pct = rule.passPercentage;
        if (typeof pct !== "number" || pct <= 0 || pct >= 100) return;
        if ((rule.pendingAutomatedRollouts || []).length > 0) return;
        partial.push(`${ruleLabel(rule, i)} at ${pct}%`);
      });
      if (!partial.length) continue;
      findings.push({
        entity: ref("gate", gate),
        message: `Still partial: ${listText(partial)}. Unchanged for ${age} days with no scheduled rollout step.`,
      });
    }
    return findings;
  },
};
