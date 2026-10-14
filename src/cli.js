// Command line entry point. main() returns an exit code instead of exiting, so tests can
// run it in-process. Every byte it writes passes through a redactor built from the key.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { CHECK_IDS } from "./checks/index.js";
import { ApiError, DEFAULT_BASE_URL, createClient, validateBaseUrl } from "./client.js";
import { ConfigError, MAX_AUDIT_LOG_DAYS, loadConfig } from "./config.js";
import { SEVERITIES, SEVERITY_RANK, runAudit } from "./engine.js";
import { fetchSnapshot } from "./fetch-snapshot.js";
import { createRedactor } from "./lib/redact.js";
import { parseInstant } from "./lib/time.js";
import { renderJson } from "./report/json.js";
import { renderMarkdown } from "./report/markdown.js";
import { SnapshotError, normalizeSnapshot } from "./snapshot.js";
import { NAME, VERSION } from "./version.js";

export const KEY_ENV = "STATSIG_CONSOLE_API_KEY";
export const EXIT = { OK: 0, FINDINGS: 1, USAGE: 2, API: 3 };

// Job summaries are capped at 1 MiB per step.
const SUMMARY_LIMIT = 1_000_000;

export const HELP = `${NAME} ${VERSION}
A read-only hygiene audit for a Statsig project. Unofficial.

Usage:
  ${KEY_ENV}=console-... statsig-audit [options]
  statsig-audit --input snapshot.json [options]

The Console API key is read from the ${KEY_ENV} environment variable only.
No option takes a key, so there is no reason to type one on a command line.
Use a read-only Console API key.

Output:
  --format <markdown|json>   Report format (default: markdown)
  --out <file>               Write the report to a file instead of stdout
  --fail-on <level>          Exit with 1 when a finding is at or above this
                             severity: high, medium, low or none (default: none)
  --show-emails              Show email addresses instead of masking them
  --summary <file>           Also append the Markdown report to this file
                             (for $GITHUB_STEP_SUMMARY)
  --github-output <file>     Append finding counts as key=value lines
                             (for $GITHUB_OUTPUT)

What to read:
  --config <file>            Config file (default: .statsig-audit.json if present)
  --checks <ids>             Run only these checks, comma separated (e.g. G01,E03)
  --audit-log-days <n>       Days of audit log to read, 1 to ${MAX_AUDIT_LOG_DAYS} (default: 30)
  --deep                     Make detail calls to confirm G06 and E03 candidates
  --users                    Read the project member list, needed by G14
  --input <file>             Audit a saved snapshot instead of calling the API
  --save-snapshot <file>     Save the data read from the API to a file.
                             It holds project data. It never holds the key.
  --now <date>               Count ages to this ISO date-time (default: now, or
                             the snapshot time with --input)

Other:
  --verbose                  Log progress to stderr
  -h, --help                 Show this help
  -v, --version              Show the version

Exit codes: 0 no finding at the --fail-on level, 1 findings at that level,
2 usage, config or input error, 3 the Statsig API could not be read.
Docs: https://github.com/ardaasaroglu/statsig-audit
`;

const OPTIONS = {
  format: { type: "string" },
  out: { type: "string" },
  "fail-on": { type: "string" },
  "show-emails": { type: "boolean" },
  summary: { type: "string" },
  "github-output": { type: "string" },
  config: { type: "string" },
  checks: { type: "string" },
  "audit-log-days": { type: "string" },
  deep: { type: "boolean" },
  users: { type: "boolean" },
  input: { type: "string" },
  "save-snapshot": { type: "string" },
  now: { type: "string" },
  verbose: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

const KEY_FLAG = /^--?(api[-_]?key|console[-_]?key|key|token|secret)(=|$)/i;

class UsageError extends Error {}

const isLoopback = (url) => ["127.0.0.1", "localhost", "[::1]", "::1"].includes(new URL(url).hostname);

/**
 * @param {string[]} argv arguments after the program name
 * @param {object} io injectable environment, streams and clock for tests
 */
export async function main(argv, io = {}) {
  const env = io.env || process.env;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const cwd = io.cwd || process.cwd();
  const clock = io.now || Date.now;
  const fetchImpl = io.fetch || globalThis.fetch;

  const apiKey = typeof env[KEY_ENV] === "string" ? env[KEY_ENV].trim() : "";
  const redact = createRedactor(apiKey ? [apiKey, env[KEY_ENV]] : []);
  const out = (text) => stdout.write(redact(text));
  const err = (text) => stderr.write(redact(text, { patterns: true }));
  const writeFile = (path, text) => writeFileSync(resolve(cwd, path), redact(text), "utf8");
  const appendFile = (path, text) => appendFileSync(resolve(cwd, path), redact(text), "utf8");
  let verbose = false;
  const log = (msg) => {
    if (verbose) err(`statsig-audit: ${msg}\n`);
  };

  try {
    if (argv.some((a) => KEY_FLAG.test(a))) {
      throw new UsageError(
        `There is no key option, by design: a key on the command line ends up in shell history and process lists. Set ${KEY_ENV} instead.`,
      );
    }
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false });
    } catch (error) {
      throw new UsageError(`${error.message}. Run statsig-audit --help for the options.`);
    }
    const o = parsed.values;
    verbose = Boolean(o.verbose);
    if (o.help) {
      out(HELP);
      return EXIT.OK;
    }
    if (o.version) {
      out(`${VERSION}\n`);
      return EXIT.OK;
    }

    const format = o.format ?? "markdown";
    if (!["markdown", "json"].includes(format)) throw new UsageError(`--format must be markdown or json.`);
    const failOn = o["fail-on"] ?? "none";
    if (![...SEVERITIES, "none"].includes(failOn)) throw new UsageError(`--fail-on must be high, medium, low or none.`);

    let config;
    try {
      const loaded = loadConfig({ path: o.config, cwd, checkIds: CHECK_IDS });
      config = loaded.config;
      if (loaded.path) log(`Using config ${loaded.path}`);
    } catch (error) {
      if (error instanceof ConfigError) throw new UsageError(error.message);
      throw error;
    }

    let checks = config.enabled;
    if (o.checks !== undefined) {
      const ids = o.checks.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const unknown = ids.filter((id) => !CHECK_IDS.includes(id));
      if (!ids.length || unknown.length) throw new UsageError(`Unknown check id${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ") || "(none given)"}. Known ids: ${CHECK_IDS.join(", ")}.`);
      checks = ids;
    }

    let auditLogDays = config.auditLogDays;
    if (o["audit-log-days"] !== undefined) {
      const n = Number(o["audit-log-days"]);
      if (!Number.isInteger(n) || n < 1 || n > MAX_AUDIT_LOG_DAYS) throw new UsageError(`--audit-log-days must be a whole number from 1 to ${MAX_AUDIT_LOG_DAYS}.`);
      auditLogDays = n;
    }

    let nowOverride = null;
    if (o.now !== undefined) {
      nowOverride = parseInstant(o.now);
      if (nowOverride === null) throw new UsageError(`--now must be an ISO 8601 date-time, for example 2026-10-14T09:00:00Z.`);
    }

    let snapshot;
    let requests = null;
    if (o.input !== undefined) {
      if (o.deep || o.users) err("statsig-audit: --deep and --users have no effect with --input.\n");
      let text;
      try {
        text = readFileSync(resolve(cwd, o.input), "utf8");
      } catch (error) {
        throw new UsageError(`Cannot read the snapshot ${o.input}: ${error.code || error.message}`);
      }
      try {
        snapshot = normalizeSnapshot(JSON.parse(text.replace(/^\uFEFF/, "")));
      } catch (error) {
        if (error instanceof SyntaxError) throw new UsageError(`The snapshot ${o.input} is not valid JSON: ${error.message}`);
        if (error instanceof SnapshotError) throw new UsageError(`${o.input}: ${error.message}`);
        throw error;
      }
      log(`Read snapshot ${o.input}`);
    } else {
      if (!apiKey) {
        throw new UsageError(
          `Set ${KEY_ENV} to a Console API key (a read-only key is enough), or audit a saved snapshot with --input.\n` +
            `Create the key in the Statsig console under Project Settings, Environments & Keys.`,
        );
      }
      // Outer whitespace is trimmed above. Anything else outside printable ASCII cannot go in
      // an HTTP header, and fetch would report it as a network error.
      if (!/^[\x21-\x7E]+$/.test(apiKey)) {
        throw new UsageError(
          `${KEY_ENV} contains a space, a line break or a character outside printable ASCII, so it cannot be sent in a request header. A Console API key has none of these. Copy the key again from the Statsig console.`,
        );
      }
      if (/^(secret|client)-/i.test(apiKey)) {
        throw new UsageError(`${KEY_ENV} holds a server or client SDK key. The audit needs a Console API key, which starts with "console-".`);
      }
      if (apiKey.length < 16) throw new UsageError(`${KEY_ENV} is too short to be a Console API key.`);
      if (!/^console-/i.test(apiKey)) err(`statsig-audit: ${KEY_ENV} does not start with "console-". Continuing, but check that it is a Console API key.\n`);

      let baseUrl = DEFAULT_BASE_URL;
      if (env.STATSIG_AUDIT_API_BASE) {
        try {
          baseUrl = validateBaseUrl(env.STATSIG_AUDIT_API_BASE);
        } catch (error) {
          throw new UsageError(`STATSIG_AUDIT_API_BASE: ${error.message}`);
        }
      }
      // Timing knobs exist for the test suite and only apply to a loopback test server.
      const testing = isLoopback(baseUrl);
      const knob = (name, fallback) => (testing && env[name] !== undefined && /^\d+$/.test(env[name]) ? Number(env[name]) : fallback);
      const client = createClient({
        apiKey,
        baseUrl,
        fetch: fetchImpl,
        now: clock,
        log,
        userAgent: `${NAME}/${VERSION}`,
        retryBaseMs: knob("STATSIG_AUDIT_RETRY_BASE_MS", 1000),
        minIntervalMs: knob("STATSIG_AUDIT_MIN_INTERVAL_MS", 100),
        ...(io.clientOptions || {}),
      });
      log(`Reading ${baseUrl} with the key from ${KEY_ENV}`);
      try {
        snapshot = await fetchSnapshot(client, { now: nowOverride ?? clock(), auditLogDays, deep: Boolean(o.deep), users: Boolean(o.users), log });
      } catch (error) {
        if (error instanceof ApiError) {
          err(`statsig-audit: ${error.message}\n`);
          return EXIT.API;
        }
        throw error;
      } finally {
        requests = client.stats.requests;
      }
      log(`Done reading: ${client.stats.requests} GET requests, ${client.stats.retries} retries`);
    }

    if (o["save-snapshot"] !== undefined) {
      writeFile(o["save-snapshot"], `${JSON.stringify(snapshot, null, 2)}\n`);
      err(
        `statsig-audit: saved the snapshot to ${o["save-snapshot"]}. It holds project data: entity names, rules, targeting values, owner names and emails. It holds no API key. Keep it out of public repositories.\n`,
      );
    }

    const now = nowOverride ?? parseInstant(snapshot.fetchedAt) ?? clock();
    const result = runAudit(snapshot, config, { now, checks, requestCount: requests });
    const showEmails = Boolean(o["show-emails"]);
    const report = format === "json" ? renderJson(result, { showEmails }) : renderMarkdown(result, { showEmails });

    if (o.out !== undefined) writeFile(o.out, report);
    else out(report);

    if (o.summary !== undefined) {
      let summary = format === "markdown" ? report : renderMarkdown(result, { showEmails });
      if (Buffer.byteLength(summary) > SUMMARY_LIMIT) {
        summary = Buffer.from(summary).subarray(0, SUMMARY_LIMIT - 2000).toString("utf8");
        summary = `${summary.slice(0, summary.lastIndexOf("\n"))}\n\n_The report was cut to fit the job summary. The full report is in the output file._\n`;
      }
      appendFile(o.summary, summary);
    }
    const s = result.summary;
    if (o["github-output"] !== undefined) {
      const lines = [
        `findings=${s.findings}`,
        `high=${s.bySeverity.high}`,
        `medium=${s.bySeverity.medium}`,
        `low=${s.bySeverity.low}`,
        `score=${s.score ? s.score.value : ""}`,
      ];
      if (o.out !== undefined) lines.push(`report=${o.out}`);
      appendFile(o["github-output"], `${lines.join("\n")}\n`);
    }

    const errored = result.checks.filter((c) => c.status === "error");
    for (const c of errored) err(`statsig-audit: check ${c.id} failed to run: ${c.reason}\n`);
    err(
      `statsig-audit: ${s.findings} ${s.findings === 1 ? "finding" : "findings"} (${s.bySeverity.high} high, ${s.bySeverity.medium} medium, ${s.bySeverity.low} low)` +
        `${s.score ? `, hygiene score ${s.score.value}/100` : ""}${o.out !== undefined ? `. Report written to ${o.out}` : ""}.\n`,
    );
    if (errored.length) return EXIT.USAGE;
    if (failOn !== "none" && result.findings.some((f) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK[failOn])) return EXIT.FINDINGS;
    return EXIT.OK;
  } catch (error) {
    if (error instanceof UsageError) {
      err(`statsig-audit: ${error.message}\n`);
      return EXIT.USAGE;
    }
    if (error && error.code && typeof error.path === "string") {
      err(`statsig-audit: cannot write ${error.path}: ${error.code}\n`);
      return EXIT.USAGE;
    }
    err(`statsig-audit: unexpected error: ${error?.message || error}\n`);
    if (verbose && error?.stack) err(`${error.stack}\n`);
    return EXIT.USAGE;
  }
}
