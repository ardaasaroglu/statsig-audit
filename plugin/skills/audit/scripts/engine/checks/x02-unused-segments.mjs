// Generated from src/checks/x02-unused-segments.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { allConditions, conditionValues, ref } from "../lib/entities.mjs";

export default {
  id: "X02",
  title: "Segments nothing uses, and empty ID lists",
  what: "Segments that no passes_segment or fails_segment condition references in any gate, dynamic config, segment or experiment that is not archived, and ID list segments with a count of 0.",
  severity: "low",
  appliesTo: ["segment"],
  requires: ["segments", "gates"],
  rationale:
    "A segment no rule references still looks like a maintained audience, and someone will keep updating it. An ID list with no IDs matches nobody, so any rule that later points at it does nothing.",
  action: "Delete the segment if nothing outside Statsig's rules needs it. Fill the ID list or remove it.",
  overlap:
    "Statsig does not flag this. References are counted in every rule this audit reads (gates, dynamic configs, other segments and experiment targeting) on entities that are not archived. Overrides are not read.",
  run(snapshot) {
    const referenced = new Set();
    for (const { condition } of allConditions(snapshot, { liveOnly: false })) {
      if (condition.type === "passes_segment" || condition.type === "fails_segment") {
        for (const id of conditionValues(condition)) referenced.add(String(id));
      }
    }
    const findings = [];
    for (const segment of snapshot.segments || []) {
      const problems = [];
      if ((segment.type === "id_list" || segment.type === "user_store_id_list") && segment.count === 0) problems.push("Its ID list is empty.");
      if (!referenced.has(segment.id)) problems.push("No gate, dynamic config, experiment or segment rule references it.");
      if (!problems.length) continue;
      findings.push({ entity: ref("segment", segment), message: problems.join(" ") });
    }
    return findings;
  },
};
