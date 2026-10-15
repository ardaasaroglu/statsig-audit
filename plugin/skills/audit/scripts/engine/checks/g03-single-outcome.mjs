// Generated from src/checks/g03-single-outcome.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, isAllEnvironments, isEveryoneRule, ref, ruleLabel } from "../lib/entities.mjs";
import { daysSince } from "../lib/time.mjs";

/**
 * What every user gets from a gate's rules, when that is the same for everyone.
 * Rules run top to bottom and the first match decides, so an "everyone" rule ends
 * the list. Returns { value, why } or null when users can get different results.
 */
export function singleOutcome(rules) {
  const list = Array.isArray(rules) ? rules : [];
  if (list.some((r) => !isAllEnvironments(r))) return null;
  if (list.length === 0) return { value: false, why: "has no rules, so it returns false for everyone" };
  let value = null;
  for (let i = 0; i < list.length; i++) {
    const pct = list[i].passPercentage;
    if (pct !== 0 && pct !== 100) return null;
    const passes = pct === 100;
    if (value === null) value = passes;
    else if (value !== passes) return null;
    if (isEveryoneRule(list[i])) {
      return passes
        ? { value: true, why: `serves true to everyone (${ruleLabel(list[i], i)} passes 100%)` }
        : { value: false, why: `serves false to everyone (${ruleLabel(list[i], i)} passes 0%)` };
    }
  }
  // No everyone rule: users who match no rule get false, so only all-0% is uniform.
  return value === false ? { value: false, why: "has every rule at 0%, so it returns false for everyone" } : null;
}

export default {
  id: "G03",
  title: "In-progress gates that serve everyone the same value",
  what: "In Progress gates, not permanent and not marked stale, unchanged for at least singleOutcomeDays, where every user gets the same result: no rules, every rule at 0%, or an everyone rule at 0% or 100% with every rule above it at the same percentage. Gates with environment-specific rules are skipped.",
  settings: ["singleOutcomeDays"],
  severity: "medium",
  appliesTo: ["gate"],
  requires: ["gates"],
  rationale:
    "A gate that gives every user the same answer is no longer a rollout. While it stays In Progress it still logs exposures, still looks like work in flight, and nobody is prompted to remove it.",
  action: "Launch the gate if it serves true, disable it if it serves false, then remove the check from code.",
  overlap:
    "Statsig flags similar gates as STALE_PROBABLY_LAUNCHED, STALE_PROBABLY_UNLAUNCHED or STALE_NO_RULES, but never when another gate, experiment or config references the gate. This check covers those, and gates the nightly stale job has not classified yet. Gates already marked stale are left to G01.",
  run(snapshot, config, now) {
    const limit = config.thresholds.singleOutcomeDays;
    const findings = [];
    for (const gate of active(snapshot, "gate")) {
      if (gate.status !== "In Progress" || gate.type === "STALE" || gate.type === "PERMANENT") continue;
      const age = daysSince(now, gate.lastModifiedTime);
      if (age === null || age < limit) continue;
      const outcome = singleOutcome(gate.rules);
      if (!outcome) continue;
      findings.push({
        entity: ref("gate", gate),
        message: `In Progress, but it ${outcome.why}. Unchanged for ${age} days.`,
        action: outcome.value
          ? "Launch the gate (or mark it permanent if it is a kill switch), then remove the check from code."
          : "Disable the gate, then remove the check from code and archive it.",
      });
    }
    return findings;
  },
};
