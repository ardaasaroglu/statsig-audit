// Generated from src/checks/g01-stale-gates.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { active, ref } from "../lib/entities.mjs";
import { daysSince, isoDate } from "../lib/time.mjs";

// Wording follows Statsig's own definitions of each stale reason.
export const GATE_STALE_REASONS = {
  STALE_PROBABLY_DEAD_CHECK: {
    text: "no checks in the last 30 days",
    action: "Confirm no code still checks it, then archive it.",
  },
  STALE_PROBABLY_LAUNCHED: {
    text: "launched, or an everyone rule passes 100%",
    action: "Remove the check from code and keep the launched path, then archive the gate.",
  },
  STALE_PROBABLY_UNLAUNCHED: {
    text: "disabled, or an everyone rule passes 0%",
    action: "Remove the check from code and keep the default path, then archive the gate.",
  },
  STALE_PROBABLY_FORGOTTEN: {
    text: "only partially launched for some time",
    action: "Finish the rollout or roll it back, then launch or disable the gate. Mark it permanent if it must stay partial.",
  },
  STALE_NO_RULES: {
    text: "no rules, so it returns false for everyone",
    action: "Remove the check from code, then archive the gate.",
  },
  STALE_ALL_TRUE: {
    text: "returned true on every check for 30 days",
    action: "Remove the check from code and keep the true path, then archive the gate.",
  },
  STALE_ALL_FALSE: {
    text: "returned false on every check for 30 days",
    action: "Remove the check from code and keep the false path, then archive the gate.",
  },
  STALE_EMPTY_CHECKS: {
    text: "returned empty on every check for 30 days, which usually means an error",
    action: "Find out why checks come back empty. If the gate is unused, remove it from code and archive it.",
  },
};

export default {
  id: "G01",
  title: "Gates Statsig marked stale",
  what: "Gates that are not archived and whose type is STALE, which Statsig sets in a nightly job. Each finding gives the stale reason, the days since the last change and, when the audit log window covers it, the day Statsig marked it.",
  severity: "medium",
  appliesTo: ["gate"],
  requires: ["gates"],
  rationale:
    "Statsig marks a gate stale when it looks ready to remove. Each one is a branch in code that nobody needs but everyone still has to read, test and keep working. The console shows them one gate at a time. This lists them together, with their reason, owner and age.",
  action: "Follow the action for each reason, or mark the gate permanent if it must stay.",
  overlap:
    "Reuses Statsig's own stale flag and reason, and adds the owner, the age and, when the audit log covers it, the date Statsig marked it.",
  run(snapshot, config, now) {
    const staleSince = new Map();
    for (const log of snapshot.auditLogs || []) {
      if (log.actionType !== "gate_stale_status_update" || typeof log.timestamp !== "number") continue;
      const prev = staleSince.get(log.name);
      if (prev === undefined || log.timestamp > prev) staleSince.set(log.name, log.timestamp);
    }
    const findings = [];
    for (const gate of active(snapshot, "gate")) {
      if (gate.type !== "STALE") continue;
      const reason = GATE_STALE_REASONS[gate.typeReason];
      const age = daysSince(now, gate.lastModifiedTime);
      const parts = [`Marked stale: ${reason ? reason.text : `reason ${gate.typeReason || "not given"}`}.`];
      if (age !== null) parts.push(`Last changed ${age} days ago.`);
      const marked = staleSince.get(gate.id) ?? (gate.name ? staleSince.get(gate.name) : undefined);
      if (marked !== undefined) parts.push(`Statsig marked it stale on ${isoDate(marked)}.`);
      findings.push({ entity: ref("gate", gate), message: parts.join(" "), action: reason?.action });
    }
    return findings;
  },
};
