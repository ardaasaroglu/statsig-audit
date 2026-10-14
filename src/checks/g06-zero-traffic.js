import { active, ref } from "../lib/entities.js";
import { daysSince } from "../lib/time.js";

export default {
  id: "G06",
  title: "Gates with no traffic",
  what: "Gates that are not archived and not marked stale, created at least zeroTrafficMinAgeDays ago, whose checksPerHour is 0. A gate whose rate is unknown (null) is skipped.",
  settings: ["zeroTrafficMinAgeDays"],
  severity: "medium",
  appliesTo: ["gate"],
  requires: ["gates"],
  deep: "With --deep, each candidate is confirmed against Statsig's record of production checks in the last 7 days, and gates that did get checks are dropped.",
  rationale:
    "A gate nobody checks is either dead code waiting to be removed or a gate the code checks under a different name. Both are worth knowing before someone edits its rules and expects an effect.",
  action: "Search the code for the gate name. If nothing checks it, archive it. If something should, fix the name in code.",
  overlap:
    "Statsig marks a gate STALE_PROBABLY_DEAD_CHECK after 30 days with no checks, and skips referenced gates. This check uses the current check rate and, with --deep, the 7-day production check flag. Gates already marked stale are left to G01.",
  run(snapshot, config, now) {
    const minAge = config.thresholds.zeroTrafficMinAgeDays;
    const confirmed = snapshot.details?.gateChecks || {};
    const deep = Boolean(snapshot.collected?.deep);
    const findings = [];
    for (const gate of active(snapshot, "gate")) {
      if (gate.type === "STALE" || gate.checksPerHour !== 0) continue;
      const age = daysSince(now, gate.createdTime);
      if (age === null || age < minAge) continue;
      const detail = confirmed[gate.id];
      const flag = detail ? detail.has_production_checks_in_last_7_days : null;
      if (flag === true) continue;
      let message;
      if (flag === false) message = "No production checks in the last 7 days, confirmed by Statsig.";
      else if (deep) message = "Checked 0 times per hour. Statsig did not return a 7-day production check record for it.";
      else message = "Checked 0 times per hour. Run with --deep to confirm against the last 7 days of production checks.";
      findings.push({ entity: ref("gate", gate), message: `${message} Created ${age} days ago.` });
    }
    return findings;
  },
};
