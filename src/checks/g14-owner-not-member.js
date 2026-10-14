import { active, COLLECTIONS, isBuiltInMetric, ref } from "../lib/entities.js";

const TYPES = ["gate", "dynamicConfig", "experiment", "segment", "metric"];

export default {
  id: "G14",
  title: "Owners who are no longer project members",
  what: "Entities whose owner is a person whose user id and email are both missing from the project member list. Needs --users.",
  severity: "medium",
  appliesTo: TYPES,
  requires: ["gates", "users"],
  rationale:
    "Statsig sends cleanup nudges to the owner. When the owner has left, nobody gets them, and nobody knows the history behind the entity.",
  action: "Assign a current team member as owner.",
  overlap: "Statsig keeps nudging the recorded owner. It does not reassign entities when someone leaves.",
  run(snapshot) {
    const ids = new Set();
    const emails = new Set();
    for (const user of snapshot.users || []) {
      if (user.userID) ids.add(user.userID);
      if (user.email) emails.add(user.email.toLowerCase());
    }
    const findings = [];
    for (const type of TYPES) {
      if (!Array.isArray(snapshot[COLLECTIONS[type]])) continue;
      for (const entity of active(snapshot, type)) {
        if (type === "metric" && isBuiltInMetric(entity)) continue;
        const owner = entity.owner;
        if (!owner || owner.ownerType === "SDK_KEY") continue;
        if (!owner.ownerID && !owner.ownerEmail) continue;
        const known = (owner.ownerID && ids.has(owner.ownerID)) || (owner.ownerEmail && emails.has(owner.ownerEmail.toLowerCase()));
        if (known) continue;
        const who = owner.ownerName || "The owner";
        findings.push({ entity: ref(type, entity), message: `${who} is not in the project member list.` });
      }
    }
    return findings;
  },
};
