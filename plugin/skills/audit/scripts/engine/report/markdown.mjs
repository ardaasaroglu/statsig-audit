// Generated from src/report/markdown.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
// The Markdown report, written for GitHub (README previews, job summaries, issues).

import { getCheck } from "../checks/index.mjs";
import { ENTITY_LABELS, cmp } from "../lib/entities.mjs";
import { isoMinute, parseInstant } from "../lib/time.mjs";
import { SEVERITIES } from "../engine.mjs";
import { prepareResult } from "./prepare.mjs";

const SEVERITY_TITLE = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_HINT = {
  high: "Act now: these change what users get today, or hide that they do.",
  medium: "Plan this quarter: cleanup and process gaps that grow if left alone.",
  low: "Hygiene: cheap fixes that keep the project easy to read.",
};
// Markdown lists this many findings per check and severity; the JSON report lists all.
export const MAX_ROWS = 50;
const STATUS_ORDER = ["active", "setup", "decision_made", "abandoned", "experiment_stopped", "assignment_stopped", "archived"];
const SOURCE_LABEL = {
  "console-api": "the Console API",
  mcp: "Statsig MCP read tools",
  fixture: "a fictional test fixture",
  file: "a saved snapshot",
};

/** Escapes text for a Markdown table cell or paragraph. */
export function md(text) {
  return String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/([`*[\]|])/g, "\\$1")
    .replace(/(^|[^A-Za-z0-9])_|_(?=$|[^A-Za-z0-9])/g, (m) => m.replace("_", "\\_"))
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function entityCell(entity) {
  if (entity.type === "project") return "project settings";
  if (entity.type === "tag" && entity.id === "tags") return "tag list";
  const label = ENTITY_LABELS[entity.type] || entity.type;
  const id = md(entity.id);
  return entity.permalink ? `[${id}](${entity.permalink.replace(/[()\s]/g, encodeURIComponent)}) ${label}` : `${id} ${label}`;
}

function ownerCell(entity, showEmails) {
  if (entity.type === "project" || entity.type === "tag") return "";
  const name = entity.owner ? md(entity.owner) : "not set";
  return showEmails && entity.ownerEmail ? `${name} (${md(entity.ownerEmail)})` : name;
}

function inventoryRows(inv) {
  const rows = [];
  const status = (s) => s.replace(/_/g, " ");
  if (inv.gates) {
    const g = inv.gates;
    rows.push(["Gates", g.total, [g.archived && `${g.archived} archived`, g.stale && `${g.stale} marked stale`, g.permanent && `${g.permanent} permanent`]]);
  }
  if (inv.experiments) {
    const rank = (k) => (STATUS_ORDER.includes(k) ? STATUS_ORDER.indexOf(k) : STATUS_ORDER.length);
    const entries = Object.entries(inv.experiments.byStatus).sort((a, b) => rank(a[0]) - rank(b[0]) || cmp(a[0], b[0]));
    rows.push(["Experiments", inv.experiments.total, entries.map(([k, v]) => `${v} ${status(k)}`)]);
  }
  if (inv.dynamicConfigs) {
    const d = inv.dynamicConfigs;
    rows.push(["Dynamic configs", d.total, [d.archived && `${d.archived} archived`, d.stale && `${d.stale} marked stale`]]);
  }
  if (inv.segments) rows.push(["Segments", inv.segments.total, []]);
  if (inv.metrics) {
    const m = inv.metrics;
    rows.push(["Metrics", m.total, [m.builtIn && `${m.builtIn} built in`, m.verified && `${m.verified} verified`, m.hidden && `${m.hidden} hidden`]]);
  }
  if (inv.layers) rows.push(["Layers", inv.layers.total, [inv.layers.implicit && `${inv.layers.implicit} implicit`]]);
  if (inv.holdouts) rows.push(["Holdouts", inv.holdouts.total, [`${inv.holdouts.enabled} enabled`]]);
  if (inv.tags) rows.push(["Tags", inv.tags.total, []]);
  if (inv.auditLogs) rows.push(["Audit log entries", inv.auditLogs.total, []]);
  if (inv.users) rows.push(["Project members", inv.users.total, []]);
  return rows.map(([name, total, notes]) => `| ${name} | ${total} | ${notes.filter(Boolean).join(", ")} |`);
}

/** "Avery Chen (3), Jordan Blake (2)", or null when a rollup would add nothing. */
export function ownerRollup(findings) {
  const counts = new Map();
  for (const f of findings) {
    if (f.entity.type === "project" || f.entity.type === "tag") continue;
    const key = f.entity.owner || "no owner";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < 4 || ![...counts.values()].some((n) => n > 1)) return null;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .map(([owner, n]) => `${md(owner)} (${n})`)
    .join(", ");
}

/**
 * @param {object} rawResult the result of runAudit()
 * @param {{ showEmails?: boolean }} options
 */
export function renderMarkdown(rawResult, { showEmails = false } = {}) {
  const result = prepareResult(rawResult, { showEmails });
  const { summary, snapshot } = result;
  const lines = [];
  const push = (...xs) => lines.push(...xs);

  push(`# Statsig hygiene report${snapshot.projectName ? `: ${md(snapshot.projectName)}` : ""}`, "");

  const ran = result.checks.filter((c) => c.status === "ran").length;
  const notRun = result.checks.filter((c) => c.status === "skipped" || c.status === "error");
  const disabled = result.checks.filter((c) => c.status === "disabled").length;
  const fetched = parseInstant(snapshot.fetchedAt);
  const intro = [
    `Snapshot taken ${fetched !== null ? isoMinute(fetched) : "at an unknown time"} from ${SOURCE_LABEL[snapshot.source] || md(snapshot.source)}.`,
    `${ran} checks ran${notRun.length ? `, ${notRun.length} could not run` : ""}${disabled ? `, ${disabled} turned off` : ""}.`,
  ];
  push(intro.join(" "), "");

  push("## Summary", "");
  const { high, medium, low } = summary.bySeverity;
  if (summary.findings === 0) push("**No findings.**");
  else push(`**${summary.findings} ${summary.findings === 1 ? "finding" : "findings"}:** ${high} high, ${medium} medium, ${low} low.`);
  if (summary.suppressed) push(`${summary.suppressed} more ${summary.suppressed === 1 ? "is" : "are"} suppressed by the ignore list in the config file.`);
  push("");
  if (summary.score) {
    push(
      `**Hygiene score: ${summary.score.value} / 100.** ${summary.score.cleanEntities} of ${summary.score.auditedEntities} audited entities have no high or medium finding.`,
      "",
    );
  }

  const inv = inventoryRows(summary.inventory);
  if (inv.length) push("| Inventory | Count | Notes |", "| --- | ---: | --- |", ...inv, "");

  const withFindings = result.checks.filter((c) => c.status === "ran" && c.findings > 0);
  if (withFindings.length) {
    push("| Check | High | Medium | Low |", "| --- | ---: | ---: | ---: |");
    for (const c of withFindings) {
      const n = { high: 0, medium: 0, low: 0 };
      for (const f of result.findings) if (f.check === c.id) n[f.severity]++;
      push(`| ${c.id} ${md(c.title)} | ${n.high || ""} | ${n.medium || ""} | ${n.low || ""} |`);
    }
    push("");
  }

  for (const severity of SEVERITIES) {
    const group = result.findings.filter((f) => f.severity === severity);
    if (!group.length) continue;
    push(`## ${SEVERITY_TITLE[severity]} (${group.length})`, "", `_${SEVERITY_HINT[severity]}_`, "");
    const checkIds = [...new Set(group.map((f) => f.check))];
    for (const id of checkIds) {
      const check = getCheck(id);
      const items = group.filter((f) => f.check === id);
      push(`### ${id} ${md(check.title)} (${items.length})`, "");
      push(`**Why it matters.** ${md(check.rationale)}`, "");
      push(`**What to do.** ${md(check.action)}`, "");
      push("| Entity | Finding | Owner |", "| --- | --- | --- |");
      for (const f of items.slice(0, MAX_ROWS)) {
        const extra = f.action && f.action !== check.action ? `<br>**Do:** ${md(f.action)}` : "";
        push(`| ${entityCell(f.entity)} | ${md(f.message)}${extra} | ${ownerCell(f.entity, showEmails)} |`);
      }
      push("");
      if (items.length > MAX_ROWS) push(`${items.length - MAX_ROWS} more ${id} findings are in the JSON report (--format json).`, "");
      const rollup = ownerRollup(items);
      if (rollup) push(`By owner: ${rollup}.`, "");
    }
  }

  if (notRun.length) {
    push("## Checks that could not run", "", "| Check | Why |", "| --- | --- |");
    for (const c of notRun) push(`| ${c.id} ${md(c.title)} | ${md(c.reason)} |`);
    push("");
  }

  if (result.suppressed.length) {
    push("## Suppressed by the config file", "", "| Check | Entity | Reason |", "| --- | --- | --- |");
    for (const s of result.suppressed) {
      push(`| ${s.check} | ${md(s.entity.id)} ${ENTITY_LABELS[s.entity.type] || s.entity.type} | ${md(s.reason || "no reason given")} |`);
    }
    push("");
  }

  const reads =
    snapshot.source === "console-api" && typeof snapshot.requests === "number"
      ? `It made ${snapshot.requests} GET requests and changed nothing.`
      : "This run read a saved snapshot and made no requests.";
  push(
    "---",
    "",
    `Generated by [statsig-audit](https://github.com/ardaasaroglu/statsig-audit) ${result.tool.version}, an unofficial read-only tool. ${reads} Ages are counted to ${isoMinute(parseInstant(result.evaluatedAt))}. Check details: [docs/checks.md](https://github.com/ardaasaroglu/statsig-audit/blob/main/docs/checks.md).`,
    "",
  );
  return lines.join("\n");
}
