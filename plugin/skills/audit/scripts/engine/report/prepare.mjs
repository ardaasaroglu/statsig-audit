// Generated from src/report/prepare.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { maskEmails } from "../lib/redact.mjs";

/**
 * Applies the privacy defaults before any report is rendered: owner emails are removed
 * and any email address left in a string is masked, unless showEmails is set.
 */
export function prepareResult(result, { showEmails = false } = {}) {
  const clone = structuredClone(result);
  if (showEmails) return clone;
  const strip = (entity) => {
    if (entity && typeof entity === "object" && "ownerEmail" in entity) entity.ownerEmail = null;
  };
  for (const f of clone.findings) {
    strip(f.entity);
    for (const r of f.related || []) strip(r);
  }
  return maskDeep(clone);
}

function maskDeep(value) {
  if (typeof value === "string") return maskEmails(value);
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = maskDeep(value[key]);
  }
  return value;
}
