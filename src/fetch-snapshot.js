// Builds a snapshot from the Console API with list calls only. Detail calls run only
// with --deep, and only for the entities that a check needs to confirm.

import { ApiError } from "./client.js";
import { normalizeSnapshot } from "./snapshot.js";
import { DAY_MS, isoDate } from "./lib/time.js";

export const MAX_DEEP_CALLS = 200;

/**
 * @param {ReturnType<import("./client.js").createClient>} client
 * @param {{ now: number, auditLogDays: number, deep: boolean, users: boolean, log?: (msg: string) => void }} options
 */
export async function fetchSnapshot(client, { now, auditLogDays = 30, deep = false, users = false, log = () => {} }) {
  const raw = {
    schemaVersion: 1,
    fetchedAt: new Date(now).toISOString(),
    source: "console-api",
    collected: { auditLogDays, deep, includesArchivedGates: true },
    unavailable: {},
  };

  // Skips an endpoint the key may not read (403) or the project does not have (404).
  // A rejected key (401), rate limits, server and network errors still stop the run,
  // because a partial snapshot would make a clean report look cleaner than it is.
  async function optional(key, read) {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ApiError && (error.kind === "forbidden" || error.kind === "not_found")) {
        raw.unavailable[key] = `HTTP ${error.status}`;
        log(`Skipping ${key}: HTTP ${error.status}`);
        return null;
      }
      throw error;
    }
  }

  log("Reading gates");
  raw.gates = await client.getAll("/gates", { includeArchived: "true", includeArchiveMetadata: "true" });
  log("Reading experiments");
  raw.experiments = await client.getAll("/experiments");
  log("Reading dynamic configs");
  raw.dynamicConfigs = await client.getAll("/dynamic_configs");
  log("Reading segments, metrics, layers, holdouts and tags");
  raw.segments = await optional("segments", () => client.getAll("/segments"));
  raw.metrics = await optional("metrics", () => client.getAll("/metrics/list", { showHiddenMetrics: "true" }));
  raw.layers = await optional("layers", () => client.getAll("/layers"));
  raw.holdouts = await optional("holdouts", () => client.getAll("/holdouts"));
  raw.tags = await optional("tags", () => client.getAll("/tags"));

  log(`Reading audit logs for the last ${auditLogDays} days`);
  raw.auditLogs = await optional("auditLogs", () =>
    client.getAll("/audit_logs", { startDate: isoDate(now - auditLogDays * DAY_MS), endDate: isoDate(now) }),
  );
  raw.reviewSettings = await optional("reviewSettings", async () => {
    const body = await client.get("/settings/reviews");
    return body && typeof body.data === "object" ? body.data : null;
  });

  if (users) {
    log("Reading project members");
    raw.users = await optional("users", () => client.getAll("/users"));
  } else {
    raw.users = null;
    raw.unavailable.users = "not requested";
  }

  raw.details = { gateChecks: {}, cumulativeExposures: {} };
  if (deep) await readDetails(client, raw, log);

  return normalizeSnapshot(raw);
}

async function readDetails(client, raw, log) {
  const gateIds = (raw.gates || [])
    .filter((g) => g.status !== "Archived" && g.type !== "STALE" && g.checksPerHour === 0)
    .map((g) => String(g.id))
    .sort();
  const experimentIds = (raw.experiments || [])
    .filter((e) => e.status === "active" && typeof e.targetExposures === "number" && e.targetExposures > 0)
    .map((e) => String(e.id))
    .sort();

  let budget = MAX_DEEP_CALLS;
  const take = (ids, key) => {
    const chosen = ids.slice(0, budget);
    budget -= chosen.length;
    if (chosen.length < ids.length) raw.unavailable[key] = `only the first ${chosen.length} of ${ids.length} candidates were read`;
    return chosen;
  };

  const readOne = async (path) => {
    try {
      const body = await client.get(path);
      return body?.data ?? null;
    } catch (error) {
      if (error instanceof ApiError && (error.kind === "forbidden" || error.kind === "not_found")) return null;
      throw error;
    }
  };

  const gates = take(gateIds, "gateChecks");
  log(`Deep: reading production checks for ${gates.length} gates`);
  for (const id of gates) {
    const data = await readOne(`/gates/${encodeURIComponent(id)}/checks`);
    if (data && typeof data === "object") raw.details.gateChecks[id] = data;
  }

  const experiments = take(experimentIds, "cumulativeExposures");
  log(`Deep: reading exposures for ${experiments.length} experiments`);
  for (const id of experiments) {
    const data = await readOne(`/experiments/${encodeURIComponent(id)}/cumulative_exposures`);
    if (Array.isArray(data)) raw.details.cumulativeExposures[id] = data;
  }
}
