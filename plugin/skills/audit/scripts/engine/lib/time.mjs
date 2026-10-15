// Generated from src/lib/time.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
// Time helpers. Every check receives "now" as epoch milliseconds, so results are
// deterministic for a given snapshot and reference time.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `then` to `now`, or null when `then` is not a usable timestamp. */
export function daysSince(now, then) {
  if (typeof then !== "number" || !Number.isFinite(then) || then <= 0) return null;
  return Math.floor((now - then) / DAY_MS);
}

/** YYYY-MM-DD in UTC. */
export function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2026-10-14 09:00 UTC" */
export function isoMinute(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/**
 * Audit log entries carry human strings instead of epoch numbers:
 *   date: "Mon Sep 26 2022", time: "23:46:14 GMT+0000 (Coordinated Universal Time)"
 * Returns epoch ms, or null when the pair cannot be parsed.
 */
export function parseAuditTime(date, time) {
  if (typeof date !== "string" || date.trim() === "") return null;
  const cleanTime = typeof time === "string" ? time.replace(/\s*\(.*\)\s*$/, "").trim() : "";
  const candidates = [];
  if (cleanTime) candidates.push(`${date.trim()} ${cleanTime}`);
  candidates.push(`${date.trim()} 00:00:00 GMT+0000`);
  for (const text of candidates) {
    const ms = Date.parse(text);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/** Parses an ISO 8601 string or epoch milliseconds into epoch ms, or returns null. */
export function parseInstant(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
