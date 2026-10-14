import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CHECK_IDS } from "../src/checks/index.js";
import { ConfigError, DEFAULT_NAMING, DEFAULT_THRESHOLDS, loadConfig, resolveConfig } from "../src/config.js";

const resolve = (input) => resolveConfig(input, CHECK_IDS);

describe("config", () => {
  it("defaults to every check and the documented thresholds", () => {
    const c = resolve({});
    assert.deepEqual(c.enabled, CHECK_IDS);
    assert.deepEqual(c.thresholds, { ...DEFAULT_THRESHOLDS });
    assert.deepEqual(c.naming, { ...DEFAULT_NAMING });
    assert.deepEqual(c.ignore, []);
    assert.equal(c.auditLogDays, 30);
  });

  it("applies enable, then disable, case-insensitively", () => {
    assert.deepEqual(resolve({ checks: { enable: ["g01", "G02", "E03"] } }).enabled, ["G01", "G02", "E03"]);
    assert.deepEqual(resolve({ checks: { enable: ["G01", "G02"], disable: ["g02"] } }).enabled, ["G01"]);
    assert.ok(!resolve({ checks: { disable: ["N01"] } }).enabled.includes("N01"));
  });

  it("overrides thresholds, naming and the audit log window", () => {
    const c = resolve({ thresholds: { gateCleanupDays: 90 }, naming: { pattern: "^[a-z]+$", junkPattern: null }, auditLogDays: 14 });
    assert.equal(c.thresholds.gateCleanupDays, 90);
    assert.equal(c.thresholds.partialRolloutDays, DEFAULT_THRESHOLDS.partialRolloutDays);
    assert.equal(c.naming.pattern, "^[a-z]+$");
    assert.equal(c.naming.junkPattern, null);
    assert.equal(c.auditLogDays, 14);
  });

  it("normalizes ignore rules", () => {
    const c = resolve({ ignore: [{ check: "g04", id: "holdback", reason: "on purpose" }, { id: "legacy_gate" }, { check: "N01", entity: "tag" }] });
    assert.deepEqual(c.ignore, [
      { check: "G04", id: "holdback", entity: null, reason: "on purpose" },
      { check: null, id: "legacy_gate", entity: null, reason: null },
      { check: "N01", id: null, entity: "tag", reason: null },
    ]);
  });

  const invalid = [
    [{ colour: 1 }, /unknown key "colour"/],
    [{ checks: { enable: ["Z99"] } }, /unknown check "Z99"/],
    [{ checks: { only: ["G01"] } }, /checks: unknown key "only"/],
    [{ thresholds: { gateCleanupDays: 0 } }, /whole number of 1 or more/],
    [{ thresholds: { gateCleanupDays: "60" } }, /whole number/],
    [{ thresholds: { staleDays: 3 } }, /unknown key "staleDays"/],
    [{ naming: { pattern: "([" } }, /not a valid regular expression/],
    [{ naming: { prefix: "x" } }, /naming: unknown key "prefix"/],
    [{ ignore: [{ reason: "no target" }] }, /needs "check", "id" or both/],
    [{ ignore: [{ check: "G77" }] }, /unknown check "G77"/],
    [{ ignore: [{ id: "x", entity: "flag" }] }, /entity must be one of/],
    [{ ignore: "G01" }, /"ignore" must be an array/],
    [{ auditLogDays: 365 }, /from 1 to 90/],
    [[], /must be a JSON object/],
  ];
  for (const [input, message] of invalid) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      assert.throws(() => resolve(input), (e) => e instanceof ConfigError && message.test(e.message));
    });
  }

  it("loads .statsig-audit.json from the working directory, or the file given", () => {
    const dir = mkdtempSync(join(tmpdir(), "statsig-audit-config-"));
    try {
      assert.equal(loadConfig({ cwd: dir, checkIds: CHECK_IDS }).path, null);
      writeFileSync(join(dir, ".statsig-audit.json"), "\uFEFF" + JSON.stringify({ checks: { disable: ["N01"] } }));
      const auto = loadConfig({ cwd: dir, checkIds: CHECK_IDS });
      assert.ok(auto.path.endsWith(".statsig-audit.json"));
      assert.ok(!auto.config.enabled.includes("N01"));
      writeFileSync(join(dir, "other.json"), JSON.stringify({ auditLogDays: 7 }));
      assert.equal(loadConfig({ cwd: dir, path: "other.json", checkIds: CHECK_IDS }).config.auditLogDays, 7);
      writeFileSync(join(dir, "broken.json"), "{ nope");
      assert.throws(() => loadConfig({ cwd: dir, path: "broken.json", checkIds: CHECK_IDS }), /not valid JSON/);
      assert.throws(() => loadConfig({ cwd: dir, path: "missing.json", checkIds: CHECK_IDS }), /Cannot read the config file missing\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
