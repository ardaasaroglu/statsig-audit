// Generated from src/checks/x03-metric-trust.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, isBuiltInMetric, listText, ref } from "../lib/entities.mjs";

// Metric types that only exist as definitions in the metric catalog. Event metrics that
// Statsig derives from logged events may not be listed, so they are never reported missing.
const CATALOG_TYPES = new Set(["ratio", "sum", "mean", "composite", "composite_sum", "funnel", "event_count_custom", "import_window"]);

export default {
  id: "X03",
  title: "Running experiments decided by metrics nobody vouched for",
  what: "Custom metrics that are not verified, or are hidden, and are a primary metric of an active experiment. Also primary metrics of a catalog type (ratio, sum, mean, composite, funnel and similar) that are missing from the metric list.",
  severity: "medium",
  appliesTo: ["metric", "experiment"],
  requires: ["metrics", "experiments"],
  rationale:
    "A primary metric decides whether a change ships. If its definition was never verified, or it has been hidden from the catalog, the decision rests on numbers nobody checked.",
  action: "Have the metric owner review and verify the definition, or switch the experiment to a verified metric before reading results.",
  overlap:
    "Statsig marks metrics verified and auto-archives unused ones. It does not tie unverified metrics to the experiments they decide. Built-in metrics (type user) are skipped.",
  run(snapshot) {
    const metrics = new Map();
    for (const m of snapshot.metrics || []) {
      metrics.set(`${m.name}::${m.type}`, m);
      if (m.id && !metrics.has(m.id)) metrics.set(m.id, m);
    }
    const usage = new Map(); // metric key -> { metric, experiments[] }
    const missing = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "active") continue;
      for (const pm of exp.primaryMetrics || []) {
        if (!pm.name || pm.type === "user") continue;
        const metric = metrics.get(`${pm.name}::${pm.type}`);
        if (!metric) {
          if (CATALOG_TYPES.has(pm.type)) missing.push({ exp, pm });
          continue;
        }
        if (isBuiltInMetric(metric) || (metric.isVerified && !metric.isHidden)) continue;
        const key = `${metric.name}::${metric.type}`;
        if (!usage.has(key)) usage.set(key, { metric, experiments: [] });
        usage.get(key).experiments.push(exp);
      }
    }
    const findings = [];
    for (const { metric, experiments } of usage.values()) {
      const state = [];
      if (!metric.isVerified) state.push("not verified");
      if (metric.isHidden) state.push("hidden from the catalog");
      const ids = experiments.map((e) => e.id).sort();
      findings.push({
        entity: ref("metric", metric),
        related: experiments.map((e) => ref("experiment", e)),
        message: `${listText(state).replace(/^./, (c) => c.toUpperCase())}, and it is a primary metric of ${ids.length === 1 ? "running experiment" : `${ids.length} running experiments:`} ${listText(ids)}.`,
      });
    }
    for (const { exp, pm } of missing) {
      findings.push({
        entity: ref("experiment", exp),
        message: `Its primary metric ${pm.name} (${pm.type}) is not in the metric catalog. It may have been archived or deleted.`,
      });
    }
    return findings;
  },
};
