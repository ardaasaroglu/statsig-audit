import { active, listText, ref } from "../lib/entities.js";

export default {
  id: "E04",
  title: "Experiments without a hypothesis or the right metrics",
  what: "Active or draft experiments with no hypothesis, a hypothesis shorter than minHypothesisLength characters, no primary metric, more than maxPrimaryMetrics primary metrics, or no secondary metrics.",
  settings: ["minHypothesisLength", "maxPrimaryMetrics"],
  severity: "high",
  appliesTo: ["experiment"],
  requires: ["experiments"],
  rationale:
    "Without a written hypothesis and one or a few primary metrics chosen up front, any result can be read as a win. Without secondary or guardrail metrics, a change that hurts something else ships unnoticed. High when the experiment is running, medium while it is still in setup.",
  action: "Write the hypothesis (what changes, for whom, which metric moves and by how much), pick the primary metrics, and add guardrail metrics.",
  overlap:
    "Statsig's optional Experiment Quality Score covers similar ground when it is turned on. This check works when it is off.",
  run(snapshot, config) {
    const { minHypothesisLength, maxPrimaryMetrics } = config.thresholds;
    const findings = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "active" && exp.status !== "setup") continue;
      const issues = [];
      const hypothesis = (exp.hypothesis || "").trim();
      if (!hypothesis) issues.push("no hypothesis");
      else if (hypothesis.length < minHypothesisLength) issues.push(`a ${hypothesis.length}-character hypothesis`);
      const primaries = (exp.primaryMetrics || []).length;
      if (primaries === 0) issues.push("no primary metric");
      else if (primaries > maxPrimaryMetrics) issues.push(`${primaries} primary metrics, more than ${maxPrimaryMetrics}`);
      if ((exp.secondaryMetrics || []).length === 0) issues.push("no secondary or guardrail metrics");
      if (!issues.length) continue;
      findings.push({
        severity: exp.status === "active" ? "high" : "medium",
        entity: ref("experiment", exp),
        message: `${exp.status === "active" ? "Running" : "In setup"} with ${listText(issues)}.`,
      });
    }
    return findings;
  },
};
