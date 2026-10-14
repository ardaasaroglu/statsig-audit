import { active, COLLECTIONS, listText, projectRef, ref } from "../lib/entities.js";

const TYPES = ["gate", "dynamicConfig", "experiment", "segment", "layer"];

export default {
  id: "N01",
  title: "Names off convention, scratch entities and tag drift",
  what: "Ids of gates, dynamic configs, experiments, segments and explicit layers that do not match naming.pattern or that match naming.junkPattern. Tags used on entities but missing from the tag list, and tags in the list that nothing uses (core tags excepted).",
  settings: ["naming.pattern", "naming.junkPattern"],
  severity: "low",
  appliesTo: [...TYPES, "tag"],
  requires: ["gates"],
  rationale:
    "Consistent ids make code search and cleanup reliable. Ids that start with test_ or tmp_, or end in _copy2, usually mark scratch entities nobody removed. Tags used on entities but missing from the tag list, or listed and never used, mean the taxonomy has drifted.",
  action: "Rename or archive scratch entities, and agree on one naming pattern. Add missing tags to the tag list or retag the entities.",
  overlap: "Statsig does not flag this. The default id pattern is lowercase snake_case. Both patterns can be changed or turned off in the config file under naming.",
  run(snapshot, config) {
    const pattern = config.naming.pattern ? new RegExp(config.naming.pattern) : null;
    const junk = config.naming.junkPattern ? new RegExp(config.naming.junkPattern, "i") : null;
    const findings = [];
    const used = new Set();
    for (const type of TYPES) {
      if (!Array.isArray(snapshot[COLLECTIONS[type]])) continue;
      for (const entity of active(snapshot, type)) {
        for (const tag of entity.tags || []) used.add(tag);
        if (type === "layer" && entity.isImplicitLayer) continue;
        const problems = [];
        if (junk && junk.test(entity.id)) problems.push("its id looks like a scratch or copied entity");
        if (pattern && !pattern.test(entity.id)) problems.push("its id does not match the naming pattern");
        if (problems.length) findings.push({ entity: ref(type, entity), message: `${listText(problems).replace(/^./, (c) => c.toUpperCase())}.` });
      }
    }
    for (const other of [...(snapshot.metrics || []), ...(snapshot.holdouts || [])]) for (const tag of other.tags || []) used.add(tag);

    if (Array.isArray(snapshot.tags)) {
      const catalog = new Set();
      for (const t of snapshot.tags) {
        if (t.name) catalog.add(t.name);
        if (t.id) catalog.add(t.id);
      }
      const unknown = [...used].filter((t) => !catalog.has(t)).sort();
      const unused = snapshot.tags.filter((t) => !t.isCore && t.name && !used.has(t.name) && !used.has(t.id)).map((t) => t.name).sort();
      if (unknown.length) {
        findings.push({ entity: { ...projectRef(), type: "tag", id: "tags" }, message: `Tags used on entities but not in the tag list: ${listText(unknown)}.` });
      }
      if (unused.length) {
        findings.push({ entity: { ...projectRef(), type: "tag", id: "tags" }, message: `Tags in the tag list that no entity uses: ${listText(unused)}.` });
      }
    }
    return findings;
  },
};
