import { active, COLLECTIONS, isBuiltInMetric, listText, ref } from "../lib/entities.js";

const TYPES = ["gate", "dynamicConfig", "experiment", "segment", "metric"];

export default {
  id: "G13",
  title: "Missing description, owner or tags",
  what: "Gates, dynamic configs, experiments, segments and custom metrics that are not archived and have an empty description, no owner, an API key as owner, or no tags. Tags are only expected when at least one live entity in the project has a tag.",
  severity: "low",
  appliesTo: TYPES,
  requires: ["gates"],
  rationale:
    "When an entity has no description and no owner, nobody can say whether it is safe to change or remove, so it stays forever. Tags are what make a large catalog searchable.",
  action: "Add a one-line description of what the entity controls, assign an owner, and tag it with the team or area.",
  overlap:
    "Statsig does not flag this. Built-in metrics (type user) are skipped. Tags are only expected once the project uses tags somewhere.",
  run(snapshot) {
    const usesTags = TYPES.some((t) => active(snapshot, t).some((e) => (e.tags || []).length > 0));
    const findings = [];
    for (const type of TYPES) {
      if (!Array.isArray(snapshot[COLLECTIONS[type]])) continue;
      for (const entity of active(snapshot, type)) {
        if (type === "metric" && (isBuiltInMetric(entity) || entity.isReadOnly)) continue;
        const missing = [];
        if (!entity.description || !entity.description.trim()) missing.push("no description");
        if (!entity.owner || (!entity.owner.ownerID && !entity.owner.ownerName)) missing.push("no owner");
        else if (entity.owner.ownerType === "SDK_KEY") missing.push("an API key as owner instead of a person");
        if (usesTags && (!entity.tags || entity.tags.length === 0)) missing.push("no tags");
        if (!missing.length) continue;
        const text = listText(missing);
        findings.push({ entity: ref(type, entity), message: `Has ${text}.` });
      }
    }
    return findings;
  },
};
