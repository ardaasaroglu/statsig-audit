import { active, listText, plural, ref } from "../lib/entities.js";

export default {
  id: "E05",
  title: "Several comparisons with no correction",
  what: "Active or draft experiments with more than one primary metric or more than two enabled groups, where Bonferroni and Benjamini-Hochberg corrections are all off.",
  severity: "medium",
  appliesTo: ["experiment"],
  requires: ["experiments"],
  rationale:
    "Each extra primary metric or test group is one more chance of a false positive. With three groups and two primary metrics there are four comparisons against control, and at a 5% significance level the chance that at least one looks significant by luck alone rises to about 19%. Bonferroni or Benjamini-Hochberg correction keeps the error rate where you set it.",
  action: "Turn on Bonferroni or Benjamini-Hochberg correction in the experiment's advanced settings, or cut it to one primary metric and one test group.",
  overlap: "Statsig's optional Quality Score includes a comparison correction criterion when it is turned on.",
  run(snapshot) {
    const findings = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "active" && exp.status !== "setup") continue;
      const primaries = (exp.primaryMetrics || []).length;
      const groups = (exp.groups || []).filter((g) => !g.disabled).length;
      if (primaries <= 1 && groups <= 2) continue;
      const corrected =
        exp.bonferroniCorrection || exp.bonferroniCorrectionPerMetric || exp.benjaminiHochbergPerVariant || exp.benjaminiHochbergPerMetric;
      if (corrected) continue;
      const parts = [];
      if (primaries > 1) parts.push(plural(primaries, "primary metric"));
      if (groups > 2) parts.push(plural(groups, "group"));
      findings.push({
        entity: ref("experiment", exp),
        message: `${listText(parts).replace(/^./, (c) => c.toUpperCase())}, with no Bonferroni or Benjamini-Hochberg correction.`,
      });
    }
    return findings;
  },
};
