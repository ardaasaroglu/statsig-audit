// Generated from src/checks/e06-health-checks.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, listText, ref } from "../lib/entities.mjs";

export default {
  id: "E06",
  title: "Running experiments with failing health checks",
  what: "Active experiments whose overall health check status is FAILED (high) or WARNING (medium), with the names of the checks that failed or warned.",
  severity: "high",
  appliesTo: ["experiment"],
  requires: ["experiments"],
  rationale:
    "Statsig's health checks catch setups whose results cannot be trusted: no exposures, unbalanced groups (sample ratio mismatch), users crossing between groups, missing metric data. Results from such an experiment can point the wrong way. A failed check is high, a warning is medium.",
  action: "Open the experiment's diagnostics, fix the cause, and restart the experiment if the assignment itself was broken.",
  overlap: "Uses Statsig's own health check results. Statsig shows them on each experiment; this lists every affected one in the project.",
  run(snapshot) {
    const findings = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "active") continue;
      const status = exp.healthCheckStatus;
      if (status !== "FAILED" && status !== "WARNING") continue;
      const failing = (exp.healthChecks || []).filter((h) => h.status === "FAILED" || h.status === "WARNING");
      const names = failing.map((h) => `${h.name || h.type || "unnamed check"} (${String(h.status).toLowerCase()})`);
      findings.push({
        severity: status === "FAILED" ? "high" : "medium",
        entity: ref("experiment", exp),
        message: `Health checks ${status === "FAILED" ? "failed" : "warn"}${names.length ? `: ${listText(names)}` : ""}.`,
      });
    }
    return findings;
  },
};
