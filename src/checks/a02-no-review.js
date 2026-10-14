import { projectRef } from "../lib/entities.js";

export default {
  id: "A02",
  title: "No required review for changes",
  what: "The project review settings: config reviews not required (medium) and metric reviews not required (low).",
  severity: "medium",
  appliesTo: ["project"],
  requires: ["reviewSettings"],
  rationale:
    "A gate or config change goes to production the moment it is saved. Without a required review, one person can change what every user sees, and a typo in a rule has no second pair of eyes.",
  action: "Turn on required reviews for config changes in the project settings. Metric reviews matter once metrics decide launches.",
  overlap: "Reads Statsig's own review settings. It does not change them.",
  run(snapshot) {
    const settings = snapshot.reviewSettings;
    const findings = [];
    if (settings.is_config_review_required === false) {
      findings.push({
        entity: projectRef(),
        message: "Project settings do not require a review for config changes. A team-level setting may still require one for some teams.",
      });
    }
    if (settings.is_metric_review_required === false) {
      findings.push({
        severity: "low",
        entity: projectRef(),
        message: "Project settings do not require a review for metric changes.",
      });
    }
    return findings;
  },
};
