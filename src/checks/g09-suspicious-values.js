import { allConditions, conditionValues, ref, ruleLabel } from "../lib/entities.js";
import { describeCondition } from "./g08-empty-condition.js";

const LIST_OPERATORS = new Set(["any", "none", "any_case_sensitive", "none_case_sensitive"]);
const ID_TYPES = new Set(["user_id", "email", "unit_id"]);
const RANK = { low: 0, medium: 1, high: 2 };

export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[n];
}

const domainOf = (v) => {
  const at = v.lastIndexOf("@");
  return at > 0 ? v.slice(at + 1).trim().toLowerCase() : null;
};

/** The most common email domain across all email conditions, when it is clearly the norm. */
export function majorityDomain(conditionsList) {
  const counts = new Map();
  for (const { condition } of conditionsList) {
    if (condition.type !== "email") continue;
    for (const v of conditionValues(condition)) {
      if (typeof v !== "string") continue;
      const d = domainOf(v);
      if (d) counts.set(d, (counts.get(d) || 0) + 1);
    }
  }
  let best = null;
  for (const [domain, count] of counts) if (!best || count > best.count || (count === best.count && domain < best.domain)) best = { domain, count };
  return best && best.count >= 3 ? best.domain : null;
}

const show = (values) => values.slice(0, 3).map((v) => JSON.stringify(v)).join(", ") + (values.length > 3 ? ` and ${values.length - 3} more` : "");

export default {
  id: "G09",
  title: "Targeting values that will not match",
  what: "String values in the same rules as G08 with leading or trailing spaces, surrounding quote marks, several IDs pasted into one value (a comma, semicolon or line break in a user_id, email or unit_id list), an email domain one edit away from the most common domain in the project, or duplicates. Spaces, quotes and pasted lists are high, a domain typo is medium, duplicates alone are low.",
  severity: "high",
  appliesTo: ["gate", "dynamicConfig", "segment", "experiment"],
  requires: ["gates"],
  rationale:
    "Targeting values are compared as exact strings. A value with a stray space, quotes from a pasted list, or several IDs pasted into one entry never matches, and nothing in the console says so. Duplicates are harmless but show a list nobody maintains.",
  action: "Fix the listed values in the rule. For long lists, move them into an ID list segment.",
  overlap: "Statsig does not flag this.",
  run(snapshot) {
    const list = allConditions(snapshot);
    const majority = majorityDomain(list);
    const findings = [];
    for (const { type, entity, rule, ruleIndex, condition } of list) {
      if (!condition.type || condition.type === "public") continue;
      const values = conditionValues(condition).filter((v) => typeof v === "string");
      if (!values.length) continue;
      const issues = [];
      const add = (severity, text) => issues.push({ severity, text });

      const spaced = values.filter((v) => v.trim() !== "" && v !== v.trim());
      if (spaced.length) add("high", `leading or trailing spaces in ${show(spaced)}`);
      const quoted = values.filter((v) => /^\s*["'\u201C\u2018].*["'\u201D\u2019]\s*$/.test(v) && v.trim().length > 1);
      if (quoted.length) add("high", `quote marks inside ${show(quoted)}`);
      if (ID_TYPES.has(condition.type) && LIST_OPERATORS.has(condition.operator)) {
        const joined = values.filter((v) => /[,;\n]/.test(v));
        if (joined.length) add("high", `several IDs pasted into one value: ${show(joined)}`);
      }
      if (condition.type === "email" && majority) {
        const typos = values.filter((v) => {
          const d = domainOf(v);
          return d && d !== majority && editDistance(d, majority) === 1;
        });
        if (typos.length) add("medium", `a domain one letter away from ${majority} in ${show(typos)}`);
      }
      // "any" and "none" compare without case; the _case_sensitive variants do not.
      const caseless = condition.type === "email" || ["any", "none", "str_contains_any", "str_contains_none"].includes(condition.operator);
      const seen = new Map();
      const dupes = [];
      for (const v of values) {
        const key = caseless ? v.trim().toLowerCase() : v;
        if (seen.has(key) && !dupes.includes(v)) dupes.push(v);
        seen.set(key, true);
      }
      if (dupes.length) add("low", `duplicate values: ${show(dupes)}`);

      if (!issues.length) continue;
      const severity = issues.reduce((s, i) => (RANK[i.severity] > RANK[s] ? i.severity : s), "low");
      findings.push({
        severity,
        entity: ref(type, entity),
        message: `In ${ruleLabel(rule, ruleIndex)}, ${describeCondition(condition)} has ${issues.map((i) => i.text).join("; ")}.`,
      });
    }
    return findings;
  },
};
