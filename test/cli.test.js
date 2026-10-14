import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { EXIT, main } from "../src/cli.js";
import { VERSION } from "../src/version.js";
import { startMockServer, statsigHandler } from "./helpers/mock-server.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/snapshot.json", import.meta.url));
const KEY = "console-FAKE-test-key-not-real";

function sink() {
  let text = "";
  return { write: (chunk) => ((text += chunk), true), get text() { return text; } };
}

/** Runs main() in-process with an explicit environment. Nothing is inherited from the machine. */
async function cli(args, { env = {}, cwd } = {}) {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { env, stdout, stderr, cwd: cwd || process.cwd() });
  return { code, stdout: stdout.text, stderr: stderr.text };
}

describe("cli", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "statsig-audit-cli-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("prints help and version", async () => {
    const help = await cli(["--help"]);
    assert.equal(help.code, EXIT.OK);
    assert.match(help.stdout, /STATSIG_CONSOLE_API_KEY/);
    assert.match(help.stdout, /No option takes a key/);
    const version = await cli(["-v"]);
    assert.equal(version.stdout.trim(), VERSION);
  });

  const usage = [
    [["--bogus"], /Unknown option/],
    [["--format", "xml", "--input", FIXTURE], /--format must be markdown or json/],
    [["--fail-on", "critical", "--input", FIXTURE], /--fail-on must be high, medium, low or none/],
    [["--checks", "G01,Z99", "--input", FIXTURE], /Unknown check id: Z99/],
    [["--audit-log-days", "0"], /from 1 to 90/],
    [["--now", "yesterday", "--input", FIXTURE], /--now must be an ISO 8601/],
    [["--input", "does-not-exist.json"], /Cannot read the snapshot/],
    [[], /Set STATSIG_CONSOLE_API_KEY/],
  ];
  for (const [args, message] of usage) {
    it(`exits 2 for ${args.join(" ") || "no key and no input"}`, async () => {
      const r = await cli(args.map((a) => a));
      assert.equal(r.code, EXIT.USAGE, r.stderr);
      assert.match(r.stderr, message);
    });
  }

  it("refuses SDK keys and malformed keys before any request", async () => {
    const server = await startMockServer(() => ({ body: { message: "ok", data: [] } }));
    try {
      for (const [key, message] of [["secret-abcdefghijklmnopqrstuv", /server or client SDK key/], ["client-abcdefghijklmnopqrstuv", /server or client SDK key/], ["console-short", /too short/]]) {
        const r = await cli([], { env: { STATSIG_CONSOLE_API_KEY: key, STATSIG_AUDIT_API_BASE: server.base } });
        assert.equal(r.code, EXIT.USAGE);
        assert.match(r.stderr, message);
        assert.ok(!r.stderr.includes(key));
      }
      assert.equal(server.requests.length, 0);
    } finally {
      await server.close();
    }
  });

  it("refuses a key with a space, a line break or a non-ASCII character, without echoing it", async () => {
    const server = await startMockServer(statsigHandler({ gates: [], experiments: [] }));
    try {
      const malformed = [
        "console-ABCdef123\nXYZ456789",
        "console-ABCdef123\r\nXYZ456789",
        "console-ABCdef123 XYZ456789",
        "console-ABCdef123\tXYZ456789",
        "console-ABCdéf123XYZ456789",
        "console-ABCdef123​XYZ456789",
      ];
      for (const key of malformed) {
        const r = await cli([], { env: { STATSIG_CONSOLE_API_KEY: key, STATSIG_AUDIT_API_BASE: server.base } });
        assert.equal(r.code, EXIT.USAGE, JSON.stringify(key));
        assert.match(r.stderr, /contains a space, a line break or a character outside printable ASCII/);
        for (const fragment of ["ABCd", "XYZ456789"]) {
          assert.ok(!r.stderr.includes(fragment) && !r.stdout.includes(fragment), `a key fragment was echoed for ${JSON.stringify(key)}`);
        }
      }
      assert.equal(server.requests.length, 0);

      // Whitespace around the key is a copy and paste artifact. It is trimmed, not refused.
      const padded = await cli(["--checks", "G01"], {
        env: { STATSIG_CONSOLE_API_KEY: `  ${KEY}\r\n`, STATSIG_AUDIT_API_BASE: server.base, STATSIG_AUDIT_MIN_INTERVAL_MS: "0" },
      });
      assert.equal(padded.code, EXIT.OK, padded.stderr);
      assert.ok(server.requests.length > 0);
      assert.ok(server.requests.every((q) => q.headers["statsig-api-key"] === KEY));
    } finally {
      await server.close();
    }
  });

  it("refuses an API base URL that is not Statsig or loopback", async () => {
    const r = await cli([], { env: { STATSIG_CONSOLE_API_KEY: KEY, STATSIG_AUDIT_API_BASE: "https://collector.example.test/console/v1" } });
    assert.equal(r.code, EXIT.USAGE);
    assert.match(r.stderr, /must be https:\/\/statsigapi\.net or a loopback address/);
  });

  it("exits 3 when the API rejects the key", async () => {
    const server = await startMockServer(() => ({ status: 401, body: { message: "no" } }));
    try {
      const r = await cli([], { env: { STATSIG_CONSOLE_API_KEY: KEY, STATSIG_AUDIT_API_BASE: server.base } });
      assert.equal(r.code, EXIT.API);
      assert.match(r.stderr, /rejected the Console API key/);
      assert.equal(server.requests.length, 1);
    } finally {
      await server.close();
    }
  });

  it("rejects an invalid snapshot file", async () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ gates: "nope" }));
    const r = await cli(["--input", bad]);
    assert.equal(r.code, EXIT.USAGE);
    assert.match(r.stderr, /fetchedAt must be an ISO 8601/);
    assert.match(r.stderr, /gates must be an array or null/);
    writeFileSync(bad, "{");
    assert.match((await cli(["--input", bad])).stderr, /not valid JSON/);
  });

  describe("exit codes for --fail-on", () => {
    const cases = [
      [[], EXIT.OK],
      [["--fail-on", "none"], EXIT.OK],
      [["--fail-on", "high"], EXIT.FINDINGS],
      [["--fail-on", "low"], EXIT.FINDINGS],
      [["--checks", "A02", "--fail-on", "high"], EXIT.OK],
      [["--checks", "A02", "--fail-on", "medium"], EXIT.FINDINGS],
      [["--checks", "X01,X02", "--fail-on", "medium"], EXIT.OK],
      [["--checks", "X01,X02", "--fail-on", "low"], EXIT.FINDINGS],
    ];
    for (const [args, code] of cases) {
      it(`${args.join(" ") || "(defaults)"} exits ${code}`, async () => {
        const r = await cli(["--input", FIXTURE, ...args]);
        assert.equal(r.code, code, r.stderr);
      });
    }
  });

  it("writes JSON, files, the job summary and outputs", async () => {
    const out = join(dir, "report.json");
    const summary = join(dir, "summary.md");
    const outputs = join(dir, "outputs.txt");
    writeFileSync(summary, "existing\n");
    const r = await cli(["--input", FIXTURE, "--format", "json", "--out", out, "--summary", summary, "--github-output", outputs]);
    assert.equal(r.code, EXIT.OK);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Report written to/);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.snapshot.requests, null);
    const summaryText = readFileSync(summary, "utf8");
    assert.ok(summaryText.startsWith("existing\n# Statsig hygiene report"));
    const lines = readFileSync(outputs, "utf8").trim().split("\n");
    assert.deepEqual(lines.map((l) => l.split("=")[0]), ["findings", "high", "medium", "low", "score", "report"]);
    assert.equal(Number(lines[0].split("=")[1]), report.summary.findings);
  });

  it("counts ages to --now, or to the snapshot time by default", async () => {
    const base = await cli(["--input", FIXTURE, "--checks", "G02", "--format", "json"]);
    const later = await cli(["--input", FIXTURE, "--checks", "G02", "--format", "json", "--now", "2026-11-13T09:00:00Z"]);
    const msg = (r) => JSON.parse(r.stdout).findings.find((f) => f.entity.id === "express_delivery_enabled").message;
    assert.match(msg(base), /94 days/);
    assert.match(msg(later), /124 days/);
  });

  it("reads .statsig-audit.json from the working directory, and --config explicitly", async () => {
    writeFileSync(join(dir, ".statsig-audit.json"), JSON.stringify({ checks: { enable: ["A02"] } }));
    const auto = await cli(["--input", FIXTURE, "--format", "json"], { cwd: dir });
    assert.deepEqual(JSON.parse(auto.stdout).checks.filter((c) => c.status === "ran").map((c) => c.id), ["A02"]);
    writeFileSync(join(dir, "typo.json"), JSON.stringify({ thresholds: { gateCleanupDay: 30 } }));
    const typo = await cli(["--input", FIXTURE, "--config", "typo.json"], { cwd: dir });
    assert.equal(typo.code, EXIT.USAGE);
    assert.match(typo.stderr, /unknown key "gateCleanupDay"/);
    rmSync(join(dir, ".statsig-audit.json"));
  });

  it("hides emails unless --show-emails", async () => {
    const hidden = await cli(["--input", FIXTURE]);
    assert.doesNotMatch(hidden.stdout, /[a-z]+\.[a-z]+@acme-pantry\.example/);
    assert.match(hidden.stdout, /\u2026@acme-pantry\.example/);
    const json = JSON.parse((await cli(["--input", FIXTURE, "--format", "json"])).stdout);
    assert.ok(json.findings.every((f) => f.entity.ownerEmail === null));
    const shown = await cli(["--input", FIXTURE, "--show-emails"]);
    assert.match(shown.stdout, /Avery Chen \(avery\.chen@acme-pantry\.example\)/);
  });

  it("marks checks that need missing data as could not run", async () => {
    const snap = JSON.parse(readFileSync(FIXTURE, "utf8"));
    snap.users = null;
    snap.unavailable = { users: "not requested" };
    snap.auditLogs = null;
    snap.unavailable.auditLogs = "HTTP 403";
    const file = join(dir, "partial.json");
    writeFileSync(file, JSON.stringify(snap));
    const r = await cli(["--input", file, "--format", "json"]);
    const byId = Object.fromEntries(JSON.parse(r.stdout).checks.map((c) => [c.id, c]));
    assert.equal(byId.G14.status, "skipped");
    assert.match(byId.G14.reason, /run with --users/);
    assert.equal(byId.A01.status, "skipped");
    assert.match(byId.A01.reason, /could not be read \(HTTP 403\)/);
    const md = await cli(["--input", file]);
    assert.match(md.stdout, /## Checks that could not run/);
  });
});
