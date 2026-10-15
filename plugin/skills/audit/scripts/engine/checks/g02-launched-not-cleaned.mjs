// Generated from src/checks/g02-launched-not-cleaned.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, ref } from "../lib/entities.mjs";
import { daysSince } from "../lib/time.mjs";

export default {
  id: "G02",
  title: "Launched or disabled gates past their cleanup window",
  what: "Gates with status Launched or Disabled, not archived, not permanent and not already marked stale, whose last change is at least gateCleanupDays old.",
  settings: ["gateCleanupDays"],
  severity: "medium",
  appliesTo: ["gate"],
  requires: ["gates"],
  rationale:
    "A launched gate always returns true and a disabled gate always returns false. The check left in code is dead weight, and the losing branch is untested code that still ships.",
  action: "Remove the gate check from code, keeping the path users get today, then archive the gate.",
  overlap:
    "Statsig's lifecycle guide says to remove code about 60 days after a gate is launched or disabled. The console does not list these gates for you. Gates Statsig already marked stale are left to G01, and permanent gates are skipped.",
  run(snapshot, config, now) {
    const limit = config.thresholds.gateCleanupDays;
    const findings = [];
    for (const gate of active(snapshot, "gate")) {
      if (gate.status !== "Launched" && gate.status !== "Disabled") continue;
      if (gate.type === "STALE" || gate.type === "PERMANENT") continue;
      const age = daysSince(now, gate.lastModifiedTime);
      if (age === null || age < limit) continue;
      const result = gate.status === "Launched" ? "every check returns true" : "every check returns false";
      findings.push({
        entity: ref("gate", gate),
        message: `${gate.status} and unchanged for ${age} days, so ${result}.`,
        action:
          gate.status === "Launched"
            ? "Remove the check from code and keep the launched path, then archive the gate."
            : "Remove the check from code and keep the default path, then archive the gate.",
      });
    }
    return findings;
  },
};
