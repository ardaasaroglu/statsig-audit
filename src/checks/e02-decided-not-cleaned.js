import { active, ref } from "../lib/entities.js";
import { daysSince } from "../lib/time.js";

export default {
  id: "E02",
  title: "Decided or abandoned experiments not cleaned up",
  what: "Experiments with status decision_made or abandoned, not archived, whose decision (or end, or last change) is at least experimentCleanupDays old.",
  settings: ["experimentCleanupDays"],
  severity: "medium",
  appliesTo: ["experiment"],
  requires: ["experiments"],
  rationale:
    "Once an experiment is decided, every group but the shipped one is dead code. It stays in the codebase, and the experiment stays in the console, until someone removes them. Until then the decision is only half done.",
  action: "Remove the losing branches from code, keeping the shipped one, then archive the experiment.",
  overlap:
    "Statsig sets its own isStale flag on experiments that are in progress or decided and unchanged for 30 days, and offers a code cleanup flow. This check does not read that flag. It applies its own rule, decided or abandoned for experimentCleanupDays, and gives the decision age so the cleanup can be planned. It never starts a cleanup.",
  run(snapshot, config, now) {
    const limit = config.thresholds.experimentCleanupDays;
    const findings = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "decision_made" && exp.status !== "abandoned") continue;
      const decided = exp.decisionTime ?? exp.endTime ?? exp.lastModifiedTime;
      const age = daysSince(now, decided);
      if (age === null || age < limit) continue;
      let message;
      if (exp.status === "abandoned") message = `Abandoned ${age} days ago and not archived.`;
      else {
        const shipped = (exp.groups || []).find((g) => g.id && g.id === exp.launchedGroupID);
        message = `Decision made ${age} days ago${shipped?.name ? ` (shipped "${shipped.name}")` : ""} and not archived.`;
      }
      findings.push({
        entity: ref("experiment", exp),
        message,
        action:
          exp.status === "abandoned"
            ? "Remove the test branches from code, then archive the experiment."
            : "Remove the losing branches from code, keeping the shipped one, then archive the experiment.",
      });
    }
    return findings;
  },
};
