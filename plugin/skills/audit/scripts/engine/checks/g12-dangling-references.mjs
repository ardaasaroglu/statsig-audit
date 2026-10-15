// Generated from src/checks/g12-dangling-references.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, allConditions, byId, conditionValues, isArchived, ref, ruleLabel } from "../lib/entities.mjs";

export default {
  id: "G12",
  title: "References to missing, archived or disabled entities",
  what: "passes_gate and fails_gate conditions that point at a gate that is missing or archived; passes_segment and fails_segment conditions that point at a segment that is missing or disabled; active or draft experiments assigned to a layer that does not exist; enabled holdouts that list missing or archived gates, experiments or layers.",
  severity: "high",
  appliesTo: ["gate", "dynamicConfig", "segment", "experiment", "holdout"],
  requires: ["gates", "segments"],
  rationale:
    "A rule that requires another gate or a segment depends on it staying alive. An archived gate returns false, a disabled segment matches nobody, and a deleted one matches nothing. The rule keeps its old meaning in the console and quietly changes behavior in production.",
  action: "Point the rule at the right gate or segment, or remove the condition. Restore the target if it was archived by mistake.",
  overlap: "Statsig does not flag this.",
  run(snapshot) {
    const gates = byId(snapshot.gates);
    const segments = byId(snapshot.segments);
    const archivedKnown = snapshot.collected?.includesArchivedGates !== false;
    const missingGate = archivedKnown ? "does not exist" : "was not found (the snapshot has no archived gates, so it may be archived)";
    const findings = [];

    for (const { type, entity, rule, ruleIndex, condition } of allConditions(snapshot)) {
      const where = `${ruleLabel(rule, ruleIndex)}`;
      if (condition.type === "passes_gate" || condition.type === "fails_gate") {
        for (const id of conditionValues(condition).map(String)) {
          const target = gates.get(id);
          let problem = null;
          if (!target) problem = missingGate;
          else if (isArchived("gate", target)) problem = "is archived, so it returns false";
          if (problem) findings.push({ entity: ref(type, entity), message: `In ${where}, ${condition.type} points at gate ${id}, which ${problem}.` });
        }
      }
      if (condition.type === "passes_segment" || condition.type === "fails_segment") {
        for (const id of conditionValues(condition).map(String)) {
          const target = segments.get(id);
          let problem = null;
          if (!target) problem = "does not exist";
          else if (target.isEnabled === false) problem = "is disabled, so it matches nobody";
          if (problem) findings.push({ entity: ref(type, entity), message: `In ${where}, ${condition.type} points at segment ${id}, which ${problem}.` });
        }
      }
    }

    if (Array.isArray(snapshot.layers)) {
      const layers = byId(snapshot.layers);
      for (const experiment of active(snapshot, "experiment")) {
        if (experiment.status !== "active" && experiment.status !== "setup") continue;
        if (experiment.layerID && !layers.has(experiment.layerID)) {
          findings.push({ entity: ref("experiment", experiment), message: `It is assigned to layer ${experiment.layerID}, which does not exist.` });
        }
      }
    }

    if (Array.isArray(snapshot.holdouts)) {
      const experiments = byId(snapshot.experiments);
      const layers = Array.isArray(snapshot.layers) ? byId(snapshot.layers) : null;
      for (const holdout of snapshot.holdouts) {
        if (holdout.isEnabled === false) continue;
        const problems = [];
        for (const id of holdout.gateIDs) {
          const g = gates.get(id);
          if (!g) problems.push(`It holds out gate ${id}, which ${missingGate}.`);
          else if (isArchived("gate", g)) problems.push(`It holds out gate ${id}, which is archived.`);
        }
        for (const id of holdout.experimentIDs) {
          const e = experiments.get(id);
          if (!e) problems.push(`It holds out experiment ${id}, which does not exist.`);
          else if (isArchived("experiment", e)) problems.push(`It holds out experiment ${id}, which is archived.`);
        }
        if (layers) for (const id of holdout.layerIDs) if (!layers.has(id)) problems.push(`It holds out layer ${id}, which does not exist.`);
        if (holdout.targetingGateID) {
          const g = gates.get(holdout.targetingGateID);
          if (!g) problems.push(`Its targeting gate ${holdout.targetingGateID} ${missingGate}.`);
          else if (isArchived("gate", g)) problems.push(`Its targeting gate ${holdout.targetingGateID} is archived, so it returns false.`);
        }
        for (const message of problems) findings.push({ entity: ref("holdout", holdout), message });
      }
    }
    return findings;
  },
};
