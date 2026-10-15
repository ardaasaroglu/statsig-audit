// Generated from src/snapshot.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
// The snapshot is everything the checks read: one object with a list per entity type.
// It is built from the Console API, or from a saved file (--input), which may also be
// assembled by an agent from Statsig MCP read tools. Either way it passes through
// normalizeSnapshot(), which keeps only the fields the checks use. Config values, rule
// return values and audit log change bodies are dropped on purpose.

import { parseAuditTime, parseInstant } from "./lib/time.mjs";

export const SNAPSHOT_SCHEMA_VERSION = 1;

export const LIST_COLLECTIONS = [
  "gates",
  "dynamicConfigs",
  "experiments",
  "segments",
  "metrics",
  "layers",
  "holdouts",
  "tags",
  "auditLogs",
  "users",
];

export class SnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = "SnapshotError";
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : v === null || v === undefined ? null : String(v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const bool = (v) => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);
const strArray = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined).map(String) : []);
const arr = (v) => (Array.isArray(v) ? v : isObject(v) ? [v] : []);

function pickOwner(o) {
  if (!isObject(o)) return null;
  const owner = {
    ownerID: str(o.ownerID),
    ownerType: str(o.ownerType),
    ownerName: str(o.ownerName ?? o.name),
    ownerEmail: str(o.ownerEmail),
  };
  return Object.values(owner).some((v) => v) ? owner : null;
}

function pickCondition(c) {
  if (!isObject(c)) return null;
  return {
    type: str(c.type),
    operator: str(c.operator),
    field: str(c.field),
    customID: str(c.customID),
    targetValue: c.targetValue === undefined ? null : c.targetValue,
  };
}

function pickRule(r) {
  if (!isObject(r)) return null;
  return {
    id: str(r.id),
    baseID: str(r.baseID),
    name: str(r.name),
    passPercentage: num(r.passPercentage),
    environments: Array.isArray(r.environments) ? r.environments.map(String) : null,
    conditions: arr(r.conditions).map(pickCondition).filter(Boolean),
    pendingAutomatedRollouts: arr(r.pendingAutomatedRollouts).filter(isObject).map((x) => ({ time: num(x.time), passPercent: num(x.passPercent) })),
  };
}

const rules = (v) => arr(v).map(pickRule).filter(Boolean);

function common(e) {
  return {
    id: str(e.id),
    name: str(e.name),
    description: str(e.description) ?? "",
    owner: pickOwner(e.owner),
    tags: strArray(e.tags),
    createdTime: num(e.createdTime),
    lastModifiedTime: num(e.lastModifiedTime),
    creatorName: str(e.creatorName),
    lastModifierName: str(e.lastModifierName),
    permalink: str(e.permalink),
  };
}

const metricRefs = (v) => arr(v).filter(isObject).map((m) => ({ name: str(m.name), type: str(m.type) }));

const PICKERS = {
  gates: (e) => ({
    ...common(e),
    idType: str(e.idType),
    status: str(e.status),
    isEnabled: bool(e.isEnabled),
    type: str(e.type),
    typeReason: str(e.typeReason),
    checksPerHour: num(e.checksPerHour),
    archivedAt: num(e.archivedAt),
    rules: rules(e.rules),
    reviewSettings: isObject(e.reviewSettings) ? { requiredReview: bool(e.reviewSettings.requiredReview) } : null,
  }),
  dynamicConfigs: (e) => ({
    ...common(e),
    idType: str(e.idType),
    status: str(e.status),
    isEnabled: bool(e.isEnabled),
    type: str(e.type),
    typeReason: str(e.typeReason),
    isPermanent: bool(e.isPermanent),
    checksPerHour: num(e.checksPerHour),
    rules: rules(e.rules),
    reviewSettings: isObject(e.reviewSettings) ? { requiredReview: bool(e.reviewSettings.requiredReview) } : null,
  }),
  experiments: (e) => ({
    ...common(e),
    idType: str(e.idType),
    status: str(e.status),
    isStale: bool(e.isStale),
    experimentType: str(e.experimentType),
    hypothesis: str(e.hypothesis) ?? "",
    startTime: num(e.startTime),
    endTime: num(e.endTime),
    decisionTime: num(e.decisionTime),
    decisionReason: str(e.decisionReason),
    launchedGroupID: str(e.launchedGroupID),
    duration: num(e.duration),
    targetExposures: num(e.targetExposures),
    allocation: num(e.allocation),
    layerID: str(e.layerID) || null,
    targetingGateID: str(e.targetingGateID) || null,
    groups: arr(e.groups).filter(isObject).map((g) => ({
      id: str(g.id),
      name: str(g.name),
      size: num(g.size),
      disabled: bool(g.disabled) ?? false,
      isControl: bool(g.isControl) ?? false,
    })),
    primaryMetrics: metricRefs(e.primaryMetrics),
    secondaryMetrics: metricRefs(e.secondaryMetrics),
    bonferroniCorrection: bool(e.bonferroniCorrection) ?? false,
    bonferroniCorrectionPerMetric: bool(e.bonferroniCorrectionPerMetric) ?? false,
    benjaminiHochbergPerVariant: bool(e.benjaminiHochbergPerVariant) ?? false,
    benjaminiHochbergPerMetric: bool(e.benjaminiHochbergPerMetric) ?? false,
    healthCheckStatus: str(e.healthCheckStatus),
    healthChecks: arr(e.healthChecks).filter(isObject).map((h) => ({ name: str(h.name), status: str(h.status), type: str(h.type) })),
    inlineTargetingRules: rules(e.inlineTargetingRules),
    reviewSettings: isObject(e.reviewSettings) ? { requiredReview: bool(e.reviewSettings.requiredReview) } : null,
  }),
  segments: (e) => ({
    ...common(e),
    idType: str(e.idType),
    type: str(e.type),
    count: num(e.count),
    isEnabled: bool(e.isEnabled),
    rules: rules(e.rules),
  }),
  metrics: (e) => ({
    ...common(e),
    type: str(e.type),
    directionality: str(e.directionality),
    isVerified: bool(e.isVerified) ?? false,
    isHidden: bool(e.isHidden) ?? false,
    isPermanent: bool(e.isPermanent) ?? false,
    isReadOnly: bool(e.isReadOnly) ?? false,
    lineage: {
      events: strArray(e.lineage?.events),
      metrics: strArray(e.lineage?.metrics),
    },
  }),
  layers: (e) => ({
    ...common(e),
    idType: str(e.idType),
    isImplicitLayer: bool(e.isImplicitLayer) ?? false,
  }),
  holdouts: (e) => ({
    ...common(e),
    idType: str(e.idType),
    isEnabled: bool(e.isEnabled),
    passPercentage: num(e.passPercentage),
    gateIDs: strArray(e.gateIDs),
    experimentIDs: strArray(e.experimentIDs),
    layerIDs: strArray(e.layerIDs),
    isGlobal: bool(e.isGlobal) ?? false,
    targetingGateID: str(e.targetingGateID) || null,
  }),
  tags: (e) => ({
    id: str(e.id),
    name: str(e.name),
    description: str(e.description) ?? "",
    isCore: bool(e.isCore) ?? false,
  }),
  auditLogs: (e) => ({
    id: str(e.id),
    name: str(e.name),
    actionType: str(e.actionType),
    date: str(e.date),
    time: str(e.time),
    timestamp: num(e.timestamp) ?? parseAuditTime(e.date, e.time),
    updatedBy: str(e.updatedBy),
    updatedByUserID: str(e.updatedByUserID),
  }),
  users: (e) => ({
    userID: str(e.userID),
    email: str(e.email),
    firstName: str(e.firstName),
    lastName: str(e.lastName),
    role: str(e.role),
  }),
};

// Collections whose items must carry an id.
const NEEDS_ID = new Set(["gates", "dynamicConfigs", "experiments", "segments", "metrics", "layers", "holdouts"]);

/**
 * Validates and normalizes a snapshot object. Missing collections become null, which
 * means "not collected": checks that need them are reported as skipped, not as clean.
 */
export function normalizeSnapshot(input) {
  if (!isObject(input)) throw new SnapshotError("A snapshot must be a JSON object.");
  const problems = [];
  if (input.schemaVersion !== undefined && input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    problems.push(`schemaVersion ${JSON.stringify(input.schemaVersion)} is not supported (expected ${SNAPSHOT_SCHEMA_VERSION})`);
  }
  const fetchedAt = parseInstant(input.fetchedAt);
  if (fetchedAt === null) problems.push("fetchedAt must be an ISO 8601 date-time, for example 2026-10-14T09:00:00Z");

  const out = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    tool: "statsig-audit",
    fetchedAt: fetchedAt === null ? null : new Date(fetchedAt).toISOString(),
    source: str(input.source) || "file",
    project: { name: str(input.project?.name) },
    collected: {
      auditLogDays: num(input.collected?.auditLogDays),
      deep: bool(input.collected?.deep) ?? false,
      includesArchivedGates: bool(input.collected?.includesArchivedGates) ?? true,
    },
    unavailable: isObject(input.unavailable) ? Object.fromEntries(Object.entries(input.unavailable).map(([k, v]) => [k, String(v)])) : {},
  };

  for (const key of LIST_COLLECTIONS) {
    const value = input[key];
    if (value === undefined || value === null) {
      out[key] = null;
      continue;
    }
    if (!Array.isArray(value)) {
      problems.push(`${key} must be an array or null`);
      out[key] = null;
      continue;
    }
    const items = [];
    value.forEach((item, i) => {
      if (!isObject(item)) {
        problems.push(`${key}[${i}] is not an object`);
        return;
      }
      if (NEEDS_ID.has(key) && (item.id === undefined || item.id === null || item.id === "")) {
        problems.push(`${key}[${i}] has no id`);
        return;
      }
      items.push(PICKERS[key](item));
    });
    out[key] = items;
  }

  out.reviewSettings = isObject(input.reviewSettings)
    ? {
        is_config_review_required: bool(input.reviewSettings.is_config_review_required),
        is_metric_review_required: bool(input.reviewSettings.is_metric_review_required),
      }
    : null;

  const details = isObject(input.details) ? input.details : {};
  out.details = {
    gateChecks: Object.fromEntries(
      Object.entries(isObject(details.gateChecks) ? details.gateChecks : {})
        .filter(([, v]) => isObject(v))
        .map(([id, v]) => [id, { has_production_checks_in_last_7_days: bool(v.has_production_checks_in_last_7_days) }]),
    ),
    cumulativeExposures: Object.fromEntries(
      Object.entries(isObject(details.cumulativeExposures) ? details.cumulativeExposures : {})
        .filter(([, v]) => Array.isArray(v))
        .map(([id, groups]) => [
          id,
          groups.filter(isObject).map((g) => ({
            groupID: str(g.groupID),
            groupName: str(g.groupName),
            results: arr(g.results).filter(isObject).map((r) => ({ date: str(r.date), exposures: num(r.exposures) })),
          })),
        ]),
    ),
  };

  if (problems.length) {
    const shown = problems.slice(0, 8).map((p) => `  * ${p}`).join("\n");
    const more = problems.length > 8 ? `\n  * and ${problems.length - 8} more` : "";
    throw new SnapshotError(`The snapshot is not valid:\n${shown}${more}`);
  }
  return out;
}
