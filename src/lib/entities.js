// Shared helpers for reading entities out of a normalized snapshot.

export const ENTITY_LABELS = {
  gate: "gate",
  dynamicConfig: "dynamic config",
  experiment: "experiment",
  segment: "segment",
  metric: "metric",
  layer: "layer",
  holdout: "holdout",
  project: "project",
  tag: "tag",
};

/** Collections in the snapshot, keyed by the entity type used in findings. */
export const COLLECTIONS = {
  gate: "gates",
  dynamicConfig: "dynamicConfigs",
  experiment: "experiments",
  segment: "segments",
  metric: "metrics",
  layer: "layers",
  holdout: "holdouts",
};

export function isArchived(type, entity) {
  if (!entity) return false;
  if (type === "gate") return entity.status === "Archived" || (typeof entity.archivedAt === "number" && entity.archivedAt > 0);
  if (type === "dynamicConfig") return entity.status === "Archived";
  if (type === "experiment") return entity.status === "archived";
  return false;
}

/** Statsig's built-in user-accounting metrics (DAU, retention and so on) come back with type "user". */
export function isBuiltInMetric(metric) {
  return metric?.type === "user";
}

/** The owner's display name, never the email. */
export function ownerLabel(entity) {
  const owner = entity?.owner;
  if (!owner) return null;
  if (owner.ownerType === "SDK_KEY") return owner.ownerName ? `${owner.ownerName} (API key)` : "an API key";
  return owner.ownerName || owner.ownerID || null;
}

export function ownerEmail(entity) {
  const email = entity?.owner?.ownerEmail;
  return typeof email === "string" && email.includes("@") ? email : null;
}

/** A compact reference to an entity, as findings carry it. */
export function ref(type, entity) {
  return {
    type,
    id: String(entity?.id ?? ""),
    name: entity?.name && entity.name !== entity.id ? String(entity.name) : null,
    permalink: typeof entity?.permalink === "string" && entity.permalink ? entity.permalink : null,
    owner: ownerLabel(entity),
    ownerEmail: ownerEmail(entity),
  };
}

export function projectRef() {
  return { type: "project", id: "project", name: null, permalink: null, owner: null, ownerEmail: null };
}

/** Active (non-archived) entities of one collection. */
export function active(snapshot, type) {
  const list = snapshot[COLLECTIONS[type]];
  if (!Array.isArray(list)) return [];
  return list.filter((e) => !isArchived(type, e));
}

/** Map of id to entity for one collection (archived included). */
export function byId(list) {
  const map = new Map();
  for (const e of Array.isArray(list) ? list : []) if (e && e.id != null) map.set(String(e.id), e);
  return map;
}

/** Condition target values as an array. */
export function conditionValues(condition) {
  const v = condition?.targetValue;
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** A rule with no conditions, or only "public" (everyone) conditions, matches every user. */
export function isEveryoneRule(rule) {
  const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
  return conditions.every((c) => c?.type === "public");
}

/** True when the rule applies in every environment (no environment restriction). */
export function isAllEnvironments(rule) {
  return !Array.isArray(rule?.environments) || rule.environments.length === 0;
}

export function ruleLabel(rule, index) {
  const name = typeof rule?.name === "string" && rule.name.trim() ? rule.name.trim() : null;
  return name ? `rule "${name}"` : `rule ${index + 1}`;
}

/**
 * Gates whose rules still decide something. A launched gate always passes and a
 * disabled one always fails, whatever its rules say.
 */
export function rulesAreLive(type, entity) {
  if (type === "gate") return entity.status === "In Progress" || (!entity.status && entity.isEnabled !== false);
  if (type === "dynamicConfig") return entity.status !== "Disabled" && entity.isEnabled !== false;
  if (type === "experiment") return entity.status === "active" || entity.status === "setup";
  return true;
}

/**
 * Every rule list the audit can read: gate rules, dynamic config rules, rule-based
 * segment rules and experiment inline targeting. Archived entities are never included.
 * With liveOnly (the default), only rule lists that still decide something are included.
 */
export function* ruleSets(snapshot, { liveOnly = true } = {}) {
  const keep = (type, e) => !liveOnly || rulesAreLive(type, e);
  for (const gate of active(snapshot, "gate")) if (keep("gate", gate)) yield { type: "gate", entity: gate, rules: gate.rules || [] };
  for (const config of active(snapshot, "dynamicConfig")) if (keep("dynamicConfig", config)) yield { type: "dynamicConfig", entity: config, rules: config.rules || [] };
  for (const segment of Array.isArray(snapshot.segments) ? snapshot.segments : []) {
    if (Array.isArray(segment.rules) && segment.rules.length) yield { type: "segment", entity: segment, rules: segment.rules };
  }
  for (const experiment of active(snapshot, "experiment")) {
    if (!keep("experiment", experiment)) continue;
    if (Array.isArray(experiment.inlineTargetingRules) && experiment.inlineTargetingRules.length) {
      yield { type: "experiment", entity: experiment, rules: experiment.inlineTargetingRules };
    }
  }
}

/** Every condition in every rule list from ruleSets(), with its rule and position. */
export function allConditions(snapshot, options) {
  const out = [];
  for (const set of ruleSets(snapshot, options)) {
    set.rules.forEach((rule, ruleIndex) => {
      (rule.conditions || []).forEach((condition, conditionIndex) => {
        if (condition) out.push({ ...set, rule, ruleIndex, condition, conditionIndex });
      });
    });
  }
  return out;
}

/** Locale-independent string order, so reports sort the same on every machine. */
export function cmp(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  return x < y ? -1 : x > y ? 1 : 0;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c" */
export function listText(items) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
