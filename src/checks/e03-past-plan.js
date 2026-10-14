import { active, ref } from "../lib/entities.js";
import { DAY_MS, daysSince } from "../lib/time.js";

/** Total exposures so far: the latest cumulative value of each group, summed. */
export function totalExposures(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  let total = 0;
  let any = false;
  for (const group of groups) {
    const results = (group.results || []).filter((r) => typeof r.exposures === "number");
    if (!results.length) continue;
    const latest = results.reduce((a, b) => (String(b.date) > String(a.date) ? b : a));
    total += latest.exposures;
    any = true;
  }
  return any ? total : null;
}

const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default {
  id: "E03",
  title: "Experiments running past their plan",
  what: "Active experiments that started more than duration days ago, or that have no planned duration and have run for at least experimentMaxRunDays. With --deep, also active experiments whose total exposures reached targetExposures.",
  settings: ["experimentMaxRunDays"],
  severity: "medium",
  appliesTo: ["experiment"],
  requires: ["experiments"],
  deep: "With --deep, active experiments that set a target number of exposures are also checked against their cumulative exposures.",
  rationale:
    "An experiment that runs past its planned duration keeps part of your users on a losing variant and invites peeking until something looks significant. One with no plan at all can run for months with nobody deciding.",
  action: "Read the results and make a decision, or write down why it needs more time and set a new duration.",
  overlap: "Statsig shows the planned duration on each experiment. It does not list overdue experiments across the project.",
  run(snapshot, config, now) {
    const maxRun = config.thresholds.experimentMaxRunDays;
    const exposures = snapshot.details?.cumulativeExposures || {};
    const findings = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "active") continue;
      const running = daysSince(now, exp.startTime);
      if (running === null) continue;
      const reasons = [];
      if (typeof exp.duration === "number" && exp.duration > 0) {
        const over = Math.floor((now - (exp.startTime + exp.duration * DAY_MS)) / DAY_MS);
        if (over >= 1) reasons.push(`Planned for ${exp.duration} days and running for ${running}, ${over} days over.`);
      } else if (running >= maxRun) {
        reasons.push(`No planned duration and running for ${running} days.`);
      }
      if (typeof exp.targetExposures === "number" && exp.targetExposures > 0) {
        const total = totalExposures(exposures[exp.id]);
        if (total !== null && total >= exp.targetExposures) {
          reasons.push(`Reached its target of ${fmt(exp.targetExposures)} exposures (${fmt(total)} so far).`);
        }
      }
      if (!reasons.length) continue;
      findings.push({ entity: ref("experiment", exp), message: reasons.join(" ") });
    }
    return findings;
  },
};
