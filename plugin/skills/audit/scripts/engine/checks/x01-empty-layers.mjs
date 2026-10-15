// Generated from src/checks/x01-empty-layers.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, ref } from "../lib/entities.mjs";
import { daysSince } from "../lib/time.mjs";

export default {
  id: "X01",
  title: "Layers no experiment uses",
  what: "Explicit layers (not the implicit layer Statsig creates per experiment) that no experiment uses, apart from archived ones.",
  severity: "low",
  appliesTo: ["layer"],
  requires: ["layers", "experiments"],
  rationale:
    "A layer exists to keep experiments in it mutually exclusive. With no live experiment in it, it still carries parameters that code may read, and it makes the layer list harder to trust.",
  action: "Archive or delete the layer if code no longer reads its parameters. Keep it if a new experiment is about to use it.",
  overlap: "Statsig does not flag this. Implicit layers, which Statsig creates per experiment, are skipped.",
  run(snapshot, config, now) {
    const used = new Set(active(snapshot, "experiment").map((e) => e.layerID).filter(Boolean));
    const findings = [];
    for (const layer of snapshot.layers || []) {
      if (layer.isImplicitLayer || used.has(layer.id)) continue;
      const age = daysSince(now, layer.lastModifiedTime ?? layer.createdTime);
      findings.push({
        entity: ref("layer", layer),
        message: `No experiment uses this layer, apart from archived ones.${age !== null ? ` Last changed ${age} days ago.` : ""}`,
      });
    }
    return findings;
  },
};
