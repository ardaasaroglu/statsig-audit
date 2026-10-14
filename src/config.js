// Configuration: .statsig-audit.json in the working directory, or the file given with --config.
// Unknown keys are errors, so a typo never silently turns a setting off.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_CONFIG_FILE = ".statsig-audit.json";

export const DEFAULT_THRESHOLDS = Object.freeze({
  gateCleanupDays: 60,
  singleOutcomeDays: 30,
  partialRolloutDays: 30,
  zeroTrafficMinAgeDays: 7,
  experimentCleanupDays: 30,
  experimentMaxRunDays: 60,
  ruleChurnWindowDays: 7,
  ruleChurnMinChanges: 5,
  allowlistMinSize: 5,
  minHypothesisLength: 50,
  maxPrimaryMetrics: 5,
});

export const DEFAULT_NAMING = Object.freeze({
  pattern: "^[a-z0-9]+(_[a-z0-9]+)*$",
  junkPattern: "^(test|tmp|temp|demo|scratch|untitled|asdf|foo)([_-]|\\d|$)|^copy[_-]of[_-]|[_-]copy[_-]?\\d+$|[_-]copy[_-]of[_-]",
});

export const DEFAULT_AUDIT_LOG_DAYS = 30;
export const MAX_AUDIT_LOG_DAYS = 90;

const ENTITY_TYPES = ["gate", "dynamicConfig", "experiment", "segment", "metric", "layer", "holdout", "project", "tag"];

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Validates a parsed config object and fills in defaults.
 * @param {unknown} input parsed JSON, or undefined for "no config"
 * @param {string[]} checkIds every known check id
 */
export function resolveConfig(input = {}, checkIds = [], source = "config") {
  if (!isObject(input)) throw new ConfigError(`${source}: the config must be a JSON object.`);
  const problems = [];
  const allowed = new Set(["$schema", "checks", "thresholds", "naming", "ignore", "auditLogDays"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) problems.push(`unknown key "${key}"`);

  const known = new Set(checkIds);
  const idList = (value, where) => {
    if (!Array.isArray(value)) {
      problems.push(`${where} must be an array of check ids`);
      return [];
    }
    const ids = value.map((v) => String(v).trim().toUpperCase());
    for (const id of ids) if (!known.has(id)) problems.push(`${where}: unknown check "${id}"`);
    return ids;
  };

  let enabled = [...checkIds];
  if (input.checks !== undefined) {
    if (!isObject(input.checks)) problems.push(`"checks" must be an object with "enable" and/or "disable"`);
    else {
      for (const key of Object.keys(input.checks)) if (!["enable", "disable"].includes(key)) problems.push(`checks: unknown key "${key}"`);
      if (input.checks.enable !== undefined) {
        const only = new Set(idList(input.checks.enable, "checks.enable"));
        enabled = enabled.filter((id) => only.has(id));
      }
      if (input.checks.disable !== undefined) {
        const off = new Set(idList(input.checks.disable, "checks.disable"));
        enabled = enabled.filter((id) => !off.has(id));
      }
    }
  }

  const thresholds = { ...DEFAULT_THRESHOLDS };
  if (input.thresholds !== undefined) {
    if (!isObject(input.thresholds)) problems.push(`"thresholds" must be an object`);
    else {
      for (const [key, value] of Object.entries(input.thresholds)) {
        if (!(key in DEFAULT_THRESHOLDS)) problems.push(`thresholds: unknown key "${key}"`);
        else if (!Number.isInteger(value) || value < 1) problems.push(`thresholds.${key} must be a whole number of 1 or more`);
        else thresholds[key] = value;
      }
    }
  }

  const naming = { ...DEFAULT_NAMING };
  if (input.naming !== undefined) {
    if (!isObject(input.naming)) problems.push(`"naming" must be an object`);
    else {
      for (const [key, value] of Object.entries(input.naming)) {
        if (!(key in DEFAULT_NAMING)) problems.push(`naming: unknown key "${key}"`);
        else if (value !== null && typeof value !== "string") problems.push(`naming.${key} must be a regular expression string or null`);
        else naming[key] = value;
      }
    }
  }
  for (const key of Object.keys(naming)) {
    if (naming[key] === null) continue;
    try {
      new RegExp(naming[key]);
    } catch (error) {
      problems.push(`naming.${key} is not a valid regular expression: ${error.message}`);
    }
  }

  const ignore = [];
  if (input.ignore !== undefined) {
    if (!Array.isArray(input.ignore)) problems.push(`"ignore" must be an array`);
    else {
      input.ignore.forEach((rule, i) => {
        if (!isObject(rule)) return problems.push(`ignore[${i}] must be an object`);
        for (const key of Object.keys(rule)) if (!["check", "id", "entity", "reason"].includes(key)) problems.push(`ignore[${i}]: unknown key "${key}"`);
        if (rule.check === undefined && rule.id === undefined) problems.push(`ignore[${i}] needs "check", "id" or both`);
        const check = rule.check === undefined ? null : String(rule.check).trim().toUpperCase();
        if (check && !known.has(check)) problems.push(`ignore[${i}]: unknown check "${check}"`);
        if (rule.entity !== undefined && !ENTITY_TYPES.includes(rule.entity)) problems.push(`ignore[${i}].entity must be one of ${ENTITY_TYPES.join(", ")}`);
        ignore.push({ check, id: rule.id === undefined ? null : String(rule.id), entity: rule.entity ?? null, reason: rule.reason == null ? null : String(rule.reason) });
      });
    }
  }

  let auditLogDays = DEFAULT_AUDIT_LOG_DAYS;
  if (input.auditLogDays !== undefined) {
    if (!Number.isInteger(input.auditLogDays) || input.auditLogDays < 1 || input.auditLogDays > MAX_AUDIT_LOG_DAYS) {
      problems.push(`auditLogDays must be a whole number from 1 to ${MAX_AUDIT_LOG_DAYS}`);
    } else auditLogDays = input.auditLogDays;
  }

  if (problems.length) throw new ConfigError(`${source} is not valid:\n${problems.map((p) => `  * ${p}`).join("\n")}`);
  return { enabled, thresholds, naming, ignore, auditLogDays };
}

/**
 * Loads the config file. With no explicit path, reads .statsig-audit.json from `cwd` when it exists.
 * Returns { config, path } where path is null when defaults are used.
 */
export function loadConfig({ path, cwd = process.cwd(), checkIds }) {
  const file = path ? resolve(cwd, path) : resolve(cwd, DEFAULT_CONFIG_FILE);
  if (!path && !existsSync(file)) return { config: resolveConfig({}, checkIds), path: null };
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new ConfigError(`Cannot read the config file ${path || DEFAULT_CONFIG_FILE}: ${error.code || error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new ConfigError(`The config file ${path || DEFAULT_CONFIG_FILE} is not valid JSON: ${error.message}`);
  }
  return { config: resolveConfig(parsed, checkIds, path || DEFAULT_CONFIG_FILE), path: file };
}
