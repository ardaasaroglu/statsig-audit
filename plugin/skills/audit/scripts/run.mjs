// Offline runner for the statsig-audit skill.
//
//   node run.mjs --input <snapshot.json> [--format json|markdown] [--out <file>]
//                [--checks <ids>] [--config <file>] [--now <date>]
//
// It audits a snapshot file with the copy of the audit engine in ./engine and prints the
// report, or writes it to the --out file. It reads only the files named on its command line,
// writes only the --out file, and makes no network calls. The engine copy is generated from
// the repository's src/ folder by scripts/build-plugin.mjs.
//
// Exit codes match the statsig-audit command line tool: 0 when the report is done, 2 for a
// usage, config or snapshot problem, or a check that failed to run.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHECK_IDS } from "./engine/checks/index.mjs";
import { ConfigError, loadConfig, resolveConfig } from "./engine/config.mjs";
import { runAudit } from "./engine/engine.mjs";
import { parseInstant } from "./engine/lib/time.mjs";
import { renderJson } from "./engine/report/json.mjs";
import { renderMarkdown } from "./engine/report/markdown.mjs";
import { SnapshotError, normalizeSnapshot } from "./engine/snapshot.mjs";
import { NAME, VERSION } from "./engine/version.mjs";

const EXIT = { OK: 0, USAGE: 2 };
// The same minimum as the statsig-audit command line tool, and the versions CI tests.
const MIN_NODE = 20;

const HELP = `${NAME} offline runner ${VERSION}
Audits a saved Statsig snapshot with the bundled engine. Unofficial and read-only.
It reads only the files named below, writes only the --out file and makes no
network calls.

Usage:
  node run.mjs --input <snapshot.json> [options]

Options:
  --input <file>             The snapshot to audit (required). Its format is in
                             references/snapshot-format.md.
  --format <json|markdown>   Report format (default: json)
  --out <file>               Write the report to this file instead of stdout
  --checks <ids>             Run only these checks, comma separated (e.g. G01,E03)
  --config <file>            Config file with thresholds, naming rules and an
                             ignore list (default: none)
  --now <date>               Count ages to this ISO date-time (default: the
                             snapshot time)
  -h, --help                 Show this help
  -v, --version              Show the version

Exit codes: 0 the report is done, 2 a usage, config or snapshot problem, or a
check that failed to run.
`;

const OPTIONS = {
  input: { type: "string" },
  format: { type: "string" },
  out: { type: "string" },
  checks: { type: "string" },
  config: { type: "string" },
  now: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

class UsageError extends Error {}

const say = (text) => process.stderr.write(`${NAME}: ${text}\n`);

async function main(argv) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE) {
    say(`run.mjs needs Node.js ${MIN_NODE} or newer. This is Node.js ${process.versions.node}.`);
    return EXIT.USAGE;
  }
  const cwd = process.cwd();
  try {
    // Loaded here, after the version check, because older Node versions lack parseArgs.
    const { parseArgs } = await import("node:util");
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false });
    } catch (error) {
      // A stray argument is never echoed back, whatever it holds.
      if (error.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") throw new UsageError("Unexpected argument. run.mjs takes only the options that --help lists.");
      throw new UsageError(`${error.message}. Run node run.mjs --help for the options.`);
    }
    const o = parsed.values;
    if (o.help) {
      process.stdout.write(HELP);
      return EXIT.OK;
    }
    if (o.version) {
      process.stdout.write(`${VERSION}\n`);
      return EXIT.OK;
    }
    if (o.input === undefined) {
      throw new UsageError("--input is required: the snapshot file to audit. run.mjs audits only a saved snapshot and makes no network calls.");
    }

    const format = o.format ?? "json";
    if (!["json", "markdown"].includes(format)) throw new UsageError("--format must be json or markdown.");

    let config = resolveConfig({}, CHECK_IDS);
    if (o.config !== undefined) {
      try {
        config = loadConfig({ path: o.config, cwd, checkIds: CHECK_IDS }).config;
      } catch (error) {
        if (error instanceof ConfigError) throw new UsageError(error.message);
        throw error;
      }
    }

    let checks = config.enabled;
    if (o.checks !== undefined) {
      const ids = o.checks.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const unknown = ids.filter((id) => !CHECK_IDS.includes(id));
      if (!ids.length || unknown.length) {
        throw new UsageError(`Unknown check id${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ") || "(none given)"}. Known ids: ${CHECK_IDS.join(", ")}.`);
      }
      checks = ids;
    }

    let nowOverride = null;
    if (o.now !== undefined) {
      nowOverride = parseInstant(o.now);
      if (nowOverride === null) throw new UsageError("--now must be an ISO 8601 date-time, for example 2026-10-14T09:00:00Z.");
    }

    let text;
    try {
      text = readFileSync(resolve(cwd, o.input), "utf8");
    } catch (error) {
      throw new UsageError(`Cannot read the snapshot ${o.input}: ${error.code || error.message}`);
    }
    let snapshot;
    try {
      snapshot = normalizeSnapshot(JSON.parse(text.replace(/^\uFEFF/, "")));
    } catch (error) {
      if (error instanceof SyntaxError) throw new UsageError(`The snapshot ${o.input} is not valid JSON: ${error.message}`);
      if (error instanceof SnapshotError) throw new UsageError(`${o.input}: ${error.message}`);
      throw error;
    }

    const now = nowOverride ?? parseInstant(snapshot.fetchedAt) ?? Date.now();
    const result = runAudit(snapshot, config, { now, checks });
    const report = format === "json" ? renderJson(result) : renderMarkdown(result);
    if (o.out !== undefined) writeFileSync(resolve(cwd, o.out), report, "utf8");
    else process.stdout.write(report);

    const errored = result.checks.filter((c) => c.status === "error");
    for (const c of errored) say(`check ${c.id} failed to run: ${c.reason}`);
    const s = result.summary;
    say(
      `${s.findings} ${s.findings === 1 ? "finding" : "findings"} (${s.bySeverity.high} high, ${s.bySeverity.medium} medium, ${s.bySeverity.low} low)` +
        `${s.score ? `, hygiene score ${s.score.value}/100` : ""}${o.out !== undefined ? `. Report written to ${o.out}` : ""}.`,
    );
    return errored.length ? EXIT.USAGE : EXIT.OK;
  } catch (error) {
    if (error instanceof UsageError) {
      say(error.message);
      return EXIT.USAGE;
    }
    if (error && error.code && typeof error.path === "string") {
      say(`cannot write ${error.path}: ${error.code}`);
      return EXIT.USAGE;
    }
    say(`unexpected error: ${error?.message || error}`);
    return EXIT.USAGE;
  }
}

process.exitCode = await main(process.argv.slice(2));
