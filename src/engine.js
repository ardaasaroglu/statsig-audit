// Runs the enabled checks over a snapshot and builds the audit result that both report
// formats render. Pure: the same snapshot, config and "now" always give the same result.

import { CHECKS } from "./checks/index.js";
import { cmp, isArchived, isBuiltInMetric } from "./lib/entities.js";
import { NAME, VERSION } from "./version.js";

export const SEVERITIES = ["high", "medium", "low"];
export const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
export const REPORT_SCHEMA_VERSION = 1;

const NEEDS = {
  gates: "the gate list",
  experiments: "the experiment list",
  dynamicConfigs: "the dynamic config list",
  segments: "the segment list",
  metrics: "the metric list",
  layers: "the layer list",
  holdouts: "the holdout list",
  tags: "the tag list",
  auditLogs: "the audit log",
  users: "the project member list (run with --users)",
  reviewSettings: "the project review settings",
};

function missingReason(keys, snapshot) {
  return (
    "Needs " +
    keys
      .map((k) => {
        const why = snapshot.unavailable?.[k];
        return why && why !== "not requested" ? `${NEEDS[k] || k}, which could not be read (${why})` : NEEDS[k] || k;
      })
      .join(" and ") +
    "."
  );
}

function matchesIgnore(rule, finding) {
  if (rule.check && rule.check !== finding.check) return false;
  if (rule.entity && rule.entity !== finding.entity.type) return false;
  if (rule.id && rule.id !== finding.entity.id && rule.id !== finding.entity.name) return false;
  return true;
}

function inventory(snapshot) {
  const list = (key) => (Array.isArray(snapshot[key]) ? snapshot[key] : null);
  const count = (items, fn) => items.filter(fn).length;
  const gates = list("gates");
  const configs = list("dynamicConfigs");
  const experiments = list("experiments");
  const metrics = list("metrics");
  const layers = list("layers");
  const holdouts = list("holdouts");
  const byStatus = {};
  for (const e of experiments || []) byStatus[e.status || "unknown"] = (byStatus[e.status || "unknown"] || 0) + 1;
  return {
    gates: gates && {
      total: gates.length,
      archived: count(gates, (g) => isArchived("gate", g)),
      stale: count(gates, (g) => !isArchived("gate", g) && g.type === "STALE"),
      permanent: count(gates, (g) => !isArchived("gate", g) && g.type === "PERMANENT"),
    },
    dynamicConfigs: configs && {
      total: configs.length,
      archived: count(configs, (c) => isArchived("dynamicConfig", c)),
      stale: count(configs, (c) => !isArchived("dynamicConfig", c) && c.type === "STALE"),
    },
    experiments: experiments && { total: experiments.length, byStatus: Object.fromEntries(Object.entries(byStatus).sort()) },
    segments: list("segments") && { total: snapshot.segments.length },
    metrics: metrics && {
      total: metrics.length,
      builtIn: count(metrics, isBuiltInMetric),
      verified: count(metrics, (m) => m.isVerified),
      hidden: count(metrics, (m) => m.isHidden),
    },
    layers: layers && { total: layers.length, implicit: count(layers, (l) => l.isImplicitLayer) },
    holdouts: holdouts && { total: holdouts.length, enabled: count(holdouts, (h) => h.isEnabled !== false) },
    tags: list("tags") && { total: snapshot.tags.length },
    auditLogs: list("auditLogs") && { total: snapshot.auditLogs.length },
    users: list("users") && { total: snapshot.users.length },
  };
}

/** Entities the hygiene score counts: everything a check can report on, except archived and built-in entities. */
export function auditedEntities(snapshot) {
  const out = [];
  const add = (type, items, keep = () => true) => {
    for (const e of Array.isArray(items) ? items : []) if (!isArchived(type, e) && keep(e)) out.push(`${type}:${e.id}`);
  };
  add("gate", snapshot.gates);
  add("dynamicConfig", snapshot.dynamicConfigs);
  add("experiment", snapshot.experiments);
  add("segment", snapshot.segments);
  add("metric", snapshot.metrics, (m) => !isBuiltInMetric(m) && !m.isReadOnly);
  add("layer", snapshot.layers, (l) => !l.isImplicitLayer);
  add("holdout", snapshot.holdouts);
  return out;
}

/**
 * @param {object} snapshot normalized snapshot
 * @param {object} config resolved config
 * @param {{ now: number, checks?: string[], requestCount?: number|null }} options
 */
export function runAudit(snapshot, config, { now, checks = config.enabled, requestCount = null, catalog = CHECKS } = {}) {
  const enabled = new Set(checks);
  const checkResults = [];
  const findings = [];
  const suppressed = [];
  const order = new Map(catalog.map((c, i) => [c.id, i]));

  for (const check of catalog) {
    const base = { id: check.id, title: check.title, severity: check.severity };
    if (!enabled.has(check.id)) {
      checkResults.push({ ...base, status: "disabled", reason: null, findings: 0, suppressed: 0 });
      continue;
    }
    const missing = check.requires.filter((key) => snapshot[key] === null || snapshot[key] === undefined);
    if (missing.length) {
      checkResults.push({ ...base, status: "skipped", reason: missingReason(missing, snapshot), findings: 0, suppressed: 0 });
      continue;
    }
    let raw;
    try {
      raw = check.run(snapshot, config, now);
    } catch (error) {
      checkResults.push({ ...base, status: "error", reason: `The check failed: ${error?.message || error}`, findings: 0, suppressed: 0 });
      continue;
    }
    let kept = 0;
    let dropped = 0;
    for (const f of raw) {
      const finding = {
        check: check.id,
        title: check.title,
        severity: f.severity || check.severity,
        entity: f.entity,
        message: f.message,
        action: f.action || check.action,
        related: f.related || [],
      };
      const rule = config.ignore.find((r) => matchesIgnore(r, finding));
      if (rule) {
        suppressed.push({ check: finding.check, entity: { type: finding.entity.type, id: finding.entity.id }, reason: rule.reason });
        dropped++;
      } else {
        findings.push(finding);
        kept++;
      }
    }
    checkResults.push({ ...base, status: "ran", reason: null, findings: kept, suppressed: dropped });
  }

  findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      order.get(a.check) - order.get(b.check) ||
      cmp(a.entity.type, b.entity.type) ||
      cmp(a.entity.id, b.entity.id) ||
      cmp(a.message, b.message),
  );

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity]++;

  const audited = auditedEntities(snapshot);
  const flagged = new Set(findings.filter((f) => f.severity !== "low").map((f) => `${f.entity.type}:${f.entity.id}`));
  const clean = audited.filter((key) => !flagged.has(key)).length;
  const score = audited.length ? { value: Math.round((100 * clean) / audited.length), cleanEntities: clean, auditedEntities: audited.length } : null;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: NAME, version: VERSION },
    evaluatedAt: new Date(now).toISOString(),
    snapshot: {
      fetchedAt: snapshot.fetchedAt,
      source: snapshot.source,
      projectName: snapshot.project?.name ?? null,
      auditLogDays: snapshot.collected?.auditLogDays ?? null,
      deep: Boolean(snapshot.collected?.deep),
      requests: requestCount,
    },
    summary: {
      findings: findings.length,
      bySeverity,
      suppressed: suppressed.length,
      score,
      inventory: inventory(snapshot),
    },
    checks: checkResults,
    findings,
    suppressed,
  };
}

