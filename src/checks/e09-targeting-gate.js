import { active, byId, isArchived, ref } from "../lib/entities.js";
import { singleOutcome } from "./g03-single-outcome.js";

export default {
  id: "E09",
  title: "Experiments whose targeting gate lets nobody in",
  what: "Active or draft experiments whose targeting gate is missing, archived, disabled, marked stale for returning false on every check, or passes nobody by its rules.",
  severity: "high",
  appliesTo: ["experiment"],
  requires: ["experiments", "gates"],
  rationale:
    "An experiment only enrolls users who pass its targeting gate. When that gate is missing, archived, disabled or passes nobody, the experiment collects no exposures, or none from the users it was meant for, while it looks like it is running.",
  action: "Point the experiment at a working targeting gate, or fix the gate's rules.",
  overlap: "Statsig's health checks may later show no exposures. This finds the cause before the experiment starts.",
  run(snapshot) {
    const gates = byId(snapshot.gates);
    const archivedKnown = snapshot.collected?.includesArchivedGates !== false;
    const findings = [];
    for (const exp of active(snapshot, "experiment")) {
      if (exp.status !== "active" && exp.status !== "setup") continue;
      const id = exp.targetingGateID;
      if (!id) continue;
      const gate = gates.get(id);
      let problem = null;
      if (!gate) problem = archivedKnown ? "does not exist" : "was not found (it may be archived)";
      else if (isArchived("gate", gate)) problem = "is archived, so it returns false";
      else if (gate.status === "Disabled") problem = "is disabled, so it returns false";
      else if (gate.type === "STALE" && gate.typeReason === "STALE_ALL_FALSE") problem = "returned false on every check for 30 days";
      else if (gate.status === "In Progress") {
        const outcome = singleOutcome(gate.rules);
        if (outcome && outcome.value === false) problem = outcome.why;
      }
      if (!problem) continue;
      findings.push({
        entity: ref("experiment", exp),
        related: gate ? [ref("gate", gate)] : [],
        message: `Its targeting gate ${id} ${problem}.`,
      });
    }
    return findings;
  },
};
