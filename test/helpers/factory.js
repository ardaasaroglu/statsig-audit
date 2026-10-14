// Small builders for synthetic snapshots. Every value here is made up.

import { CHECK_IDS } from "../../src/checks/index.js";
import { resolveConfig } from "../../src/config.js";
import { normalizeSnapshot } from "../../src/snapshot.js";

export const NOW = Date.parse("2026-10-14T09:00:00Z");
export const DAY = 24 * 60 * 60 * 1000;
export const ago = (days) => NOW - days * DAY;

export const OWNER = { ownerID: "u_test", ownerType: "USER", ownerName: "Test Owner", ownerEmail: "test.owner@example.test" };

export const everyone = () => [{ type: "public", operator: "any", targetValue: null }];
export const cond = (type, operator, targetValue, extra = {}) => ({ type, operator, targetValue, ...extra });
export const rule = (name, passPercentage, conditions = everyone(), extra = {}) => ({ name, passPercentage, conditions, ...extra });

export function gate(id, overrides = {}) {
  return {
    id,
    name: id,
    description: "A gate used in tests.",
    owner: OWNER,
    tags: ["tests"],
    createdTime: ago(100),
    lastModifiedTime: ago(5),
    permalink: `https://console.example.test/gates/${id}`,
    status: "In Progress",
    isEnabled: true,
    type: "TEMPORARY",
    typeReason: "NONE",
    checksPerHour: 100,
    rules: [rule("Staff", 100, [cond("user_id", "any", ["1", "2"])])],
    ...overrides,
  };
}

export function config(id, overrides = {}) {
  return {
    id,
    name: id,
    description: "A config used in tests.",
    owner: OWNER,
    tags: ["tests"],
    createdTime: ago(100),
    lastModifiedTime: ago(5),
    status: "Enabled",
    isEnabled: true,
    type: "TEMPORARY",
    typeReason: "NONE",
    rules: [],
    ...overrides,
  };
}

export function experiment(id, overrides = {}) {
  return {
    id,
    name: id,
    description: "An experiment used in tests.",
    owner: OWNER,
    tags: ["tests"],
    createdTime: ago(30),
    lastModifiedTime: ago(2),
    status: "active",
    hypothesis: "Changing the button label makes the next step clearer and lifts conversion by two percent.",
    startTime: ago(5),
    duration: 14,
    groups: [
      { id: "c", name: "Control", size: 50, isControl: true },
      { id: "t", name: "Test", size: 50 },
    ],
    primaryMetrics: [{ name: "conversion", type: "ratio" }],
    secondaryMetrics: [{ name: "errors", type: "event_count_custom" }],
    healthCheckStatus: "PASSED",
    healthChecks: [],
    targetingGateID: null,
    layerID: null,
    ...overrides,
  };
}

export function segment(id, overrides = {}) {
  return { id, name: id, description: "A segment used in tests.", owner: OWNER, tags: ["tests"], type: "id_list", count: 10, isEnabled: true, rules: [], ...overrides };
}

export function metric(name, type, overrides = {}) {
  return { id: `${name}::${type}`, name, type, description: "A metric used in tests.", owner: OWNER, tags: ["tests"], directionality: "increase", isVerified: true, isHidden: false, lineage: { events: [], metrics: [] }, ...overrides };
}

/** A normalized snapshot. Collections left out are empty lists unless set to null. */
export function snap(parts = {}) {
  return normalizeSnapshot({
    schemaVersion: 1,
    fetchedAt: new Date(NOW).toISOString(),
    source: "fixture",
    gates: [],
    dynamicConfigs: [],
    experiments: [],
    segments: [],
    metrics: [],
    layers: [],
    holdouts: [],
    tags: [],
    auditLogs: [],
    users: [],
    reviewSettings: { is_config_review_required: true, is_metric_review_required: true },
    ...parts,
  });
}

export const defaults = (input = {}) => resolveConfig(input, CHECK_IDS);
