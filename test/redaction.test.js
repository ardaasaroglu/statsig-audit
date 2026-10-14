// The Console API key must never appear in stdout, stderr, the report, the job summary,
// the outputs file or a saved snapshot, on success or on any failure path. These tests run
// the real CLI in a child process against a local mock server with a fake key.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createRedactor, maskEmails } from "../src/lib/redact.js";
import { NOW } from "./helpers/factory.js";
import { startMockServer, statsigHandler } from "./helpers/mock-server.js";
import { runCli } from "./helpers/run-cli.js";

const KEY = "console-FAKE-test-key-not-real";

const project = {
  gates: [
    {
      id: "pasted_key",
      name: "pasted_key",
      status: "In Progress",
      // A key pasted into project data must not leak through the report or the snapshot either.
      description: `Someone pasted ${KEY} here by mistake.`,
      rules: [{ name: `Beta ${KEY}`, passPercentage: 25, conditions: [{ type: "public" }] }],
      lastModifiedTime: NOW - 50 * 86400000,
      owner: { ownerName: "Test Owner", ownerEmail: "owner@example.test" },
    },
  ],
  experiments: [],
  users: [{ userID: "u1", email: "owner@example.test" }],
};

function assertNoKey(where, text) {
  assert.ok(!String(text).includes(KEY), `the key appeared in ${where}`);
}

function assertNoKeyInDir(dir) {
  for (const name of readdirSync(dir)) assertNoKey(name, readFileSync(join(dir, name), "utf8"));
}

describe("the key never reaches any output", () => {
  const servers = {};
  let dir;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "statsig-audit-redaction-"));
    servers.ok = await startMockServer(statsigHandler(project));
    servers.auth = await startMockServer(() => ({ status: 401, body: { status: 401, message: `This endpoint only accepts an active CONSOLE key, but an invalid key was sent. Key: ${KEY}` } }));
    servers.forbidden = await startMockServer(() => ({ status: 403, body: { status: 403, message: `Forbidden resource for ${KEY}` } }));
    servers.limited = await startMockServer(() => ({ status: 429, headers: { "retry-after": "0" }, body: { message: `slow down ${KEY}` } }));
    servers.broken = await startMockServer(() => ({ status: 500, body: { message: `internal error, key ${KEY}` } }));
    servers.badRequest = await startMockServer(() => ({ status: 400, body: { message: `bad request with ${KEY}` } }));
    servers.dropped = await startMockServer(() => "destroy");
  });

  after(async () => {
    for (const s of Object.values(servers)) await s.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const env = (server) => ({
    STATSIG_CONSOLE_API_KEY: KEY,
    STATSIG_AUDIT_API_BASE: server.base,
    STATSIG_AUDIT_RETRY_BASE_MS: "1",
    STATSIG_AUDIT_MIN_INTERVAL_MS: "0",
  });

  it("on success: stdout, stderr, report, snapshot, summary and outputs are clean", async () => {
    const files = ["report.md", "snapshot.json", "summary.md", "outputs.txt"].map((f) => join(dir, f));
    const r = await runCli(
      ["--verbose", "--users", "--deep", "--show-emails", "--out", files[0], "--save-snapshot", files[1], "--summary", files[2], "--github-output", files[3]],
      { env: env(servers.ok) },
    );
    assert.equal(r.code, 0, r.stderr);
    assertNoKey("stdout", r.stdout);
    assertNoKey("stderr", r.stderr);
    assertNoKeyInDir(dir);
    assert.match(readFileSync(files[0], "utf8"), /rule "Beta \[redacted\]" at 25%/);
    assert.match(readFileSync(files[1], "utf8"), /Someone pasted \[redacted\] here/);
    assert.match(r.stderr, /holds project data/);
    // The key was really used: the mock server saw it in the header on every request.
    assert.ok(servers.ok.requests.length > 5);
    assert.ok(servers.ok.requests.every((q) => q.headers["statsig-api-key"] === KEY && q.method === "GET"));

    const json = await runCli(["--format", "json"], { env: env(servers.ok) });
    assert.equal(json.code, 0);
    assertNoKey("json stdout", json.stdout);
    JSON.parse(json.stdout);
  });

  const failures = [
    ["401 that echoes the key", "auth", /rejected the Console API key/],
    ["403", "forbidden", /may not read/],
    ["429 until retries run out", "limited", /429 Too Many Requests/],
    ["500 until retries run out", "broken", /HTTP 500/],
    ["400 with the key in the body", "badRequest", /HTTP 400/],
    ["dropped connection", "dropped", /Could not reach Statsig/],
  ];
  for (const [name, server, message] of failures) {
    it(`on ${name}: exit 3 and no key anywhere`, async () => {
      const out = join(dir, `fail-${server}.md`);
      const snap = join(dir, `fail-${server}.json`);
      const r = await runCli(["--verbose", "--out", out, "--save-snapshot", snap], { env: env(servers[server]) });
      assert.equal(r.code, 3, r.stderr);
      assert.match(r.stderr, message);
      assertNoKey("stdout", r.stdout);
      assertNoKey("stderr", r.stderr);
      assertNoKeyInDir(dir);
    });
  }

  it("rejects a key passed as an option, without echoing it", async () => {
    for (const args of [["--key", KEY], [`--api-key=${KEY}`], ["--token", KEY]]) {
      const r = await runCli(args, { env: {} });
      assert.equal(r.code, 2);
      assert.match(r.stderr, /There is no key option, by design/);
      assertNoKey("stderr", r.stderr);
      assertNoKey("stdout", r.stdout);
    }
  });

  it("does not echo a key pasted as a stray argument", async () => {
    const r = await runCli([KEY], { env: env(servers.ok) });
    assert.equal(r.code, 2);
    assertNoKey("stderr", r.stderr);
    const r2 = await runCli(["console-ANOTHER-pasted-key-123"], { env: {} });
    assert.equal(r2.code, 2);
    assert.ok(!r2.stderr.includes("console-ANOTHER-pasted-key-123"));
  });
});

describe("redaction helpers", () => {
  it("removes exact secrets everywhere and masks key-shaped strings on request", () => {
    const redact = createRedactor([KEY]);
    assert.equal(redact(`a ${KEY} b ${KEY}`), "a [redacted] b [redacted]");
    assert.equal(redact("secret-abcdefghij1234", { patterns: true }), "secret-[redacted]");
    assert.equal(redact("client-abcdefghij1234"), "client-abcdefghij1234");
    assert.equal(redact("console-api"), "console-api");
  });
  it("ignores secrets too short to redact safely", () => {
    assert.equal(createRedactor(["abc"])("abc abc"), "abc abc");
  });
  it("masks emails but keeps the domain", () => {
    assert.equal(maskEmails("ping dana.reyes@acme.example now"), "ping d\u2026@acme.example now");
  });
});
