import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { CHECK_IDS } from "../src/checks/index.js";
import { DEFAULT_THRESHOLDS } from "../src/config.js";
import { runAudit } from "../src/engine.js";
import { renderJson } from "../src/report/json.js";
import { MAX_ROWS, md, ownerRollup, renderMarkdown } from "../src/report/markdown.js";
import { normalizeSnapshot } from "../src/snapshot.js";
import { NOW, defaults, gate, rule, snap } from "./helpers/factory.js";
import { validate } from "./helpers/json-schema.js";
import { renderSample } from "./helpers/sample.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const REPORT_SCHEMA = JSON.parse(read("docs/report.schema.json"));
const CONFIG_SCHEMA = JSON.parse(read("docs/config.schema.json"));

describe("golden sample report", () => {
  const sample = renderSample(ROOT);
  it("examples/sample-report.md matches the renderer byte for byte (run npm run golden after a change)", () => {
    assert.equal(sample.markdown, read("examples/sample-report.md"));
  });
  it("examples/sample-report.json matches the renderer byte for byte", () => {
    assert.equal(sample.json, read("examples/sample-report.json"));
  });
  it("runs every check, each finds something in the fixture, and one finding is suppressed", () => {
    const ran = sample.result.checks.filter((c) => c.status === "ran").map((c) => c.id);
    assert.deepEqual(ran, CHECK_IDS);
    const withFindings = new Set(sample.result.findings.map((f) => f.check));
    for (const id of CHECK_IDS) assert.ok(withFindings.has(id), `the fixture has no finding for ${id}`);
    assert.equal(sample.result.suppressed.length, 1);
  });
  it("uses only fictional data", () => {
    assert.match(sample.markdown, /Acme Pantry \(fictional\)/);
    assert.doesNotMatch(sample.markdown, /@(?!acme-pantry\.)[a-z0-9-]+\.[a-z]{2,}/i);
  });
});

describe("JSON report schema", () => {
  const sample = renderSample(ROOT);
  it("the sample report validates against docs/report.schema.json", () => {
    assert.deepEqual(validate(REPORT_SCHEMA, JSON.parse(sample.json)), []);
  });

  it("reports with missing collections and with nothing to audit validate too", () => {
    const partial = runAudit(snap({ users: null, auditLogs: null, holdouts: null }), defaults(), { now: NOW });
    assert.deepEqual(validate(REPORT_SCHEMA, JSON.parse(renderJson(partial))), []);
    const empty = runAudit(normalizeSnapshot({ fetchedAt: "2026-10-14T09:00:00Z" }), defaults(), { now: NOW });
    const parsed = JSON.parse(renderJson(empty));
    assert.deepEqual(validate(REPORT_SCHEMA, parsed), []);
    assert.equal(parsed.summary.score, null);
  });

  it("documents every field the report has: required lists match the real keys", () => {
    const report = JSON.parse(sample.json);
    const keys = (o) => Object.keys(o).sort();
    assert.deepEqual(keys(report), [...REPORT_SCHEMA.required].sort());
    assert.deepEqual(keys(report.summary), [...REPORT_SCHEMA.properties.summary.required].sort());
    assert.deepEqual(keys(report.snapshot), [...REPORT_SCHEMA.properties.snapshot.required].sort());
    assert.deepEqual(keys(report.checks[0]), [...REPORT_SCHEMA.properties.checks.items.required].sort());
    assert.deepEqual(keys(report.findings[0]), [...REPORT_SCHEMA.properties.findings.items.required].sort());
    assert.deepEqual(keys(report.findings[0].entity), [...REPORT_SCHEMA.$defs.entity.required].sort());
    assert.deepEqual(keys(report.summary.inventory), [...REPORT_SCHEMA.properties.summary.properties.inventory.required].sort());
  });

  it("rejects a report with an unknown field, so the schema stays strict", () => {
    const report = JSON.parse(sample.json);
    report.extra = true;
    report.findings[0].entity.colour = "red";
    const errors = validate(REPORT_SCHEMA, report);
    assert.equal(errors.length, 2);
  });

  it("orders findings by severity, then check order, then entity", () => {
    const { findings } = JSON.parse(sample.json);
    const rank = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < findings.length; i++) {
      const a = findings[i - 1];
      const b = findings[i];
      const order = rank[a.severity] - rank[b.severity] || CHECK_IDS.indexOf(a.check) - CHECK_IDS.indexOf(b.check);
      assert.ok(order <= 0, `${a.check} ${a.entity.id} before ${b.check} ${b.entity.id}`);
    }
  });
});

describe("config schema", () => {
  it("lists the same thresholds, defaults and check ids as the code", () => {
    const props = CONFIG_SCHEMA.properties.thresholds.properties;
    assert.deepEqual(Object.keys(props).sort(), Object.keys(DEFAULT_THRESHOLDS).sort());
    for (const [key, value] of Object.entries(DEFAULT_THRESHOLDS)) assert.equal(props[key].default, value, key);
    assert.deepEqual(CONFIG_SCHEMA.$defs.checkId.enum, CHECK_IDS);
  });
  it("the example config validates against it", () => {
    assert.deepEqual(validate(CONFIG_SCHEMA, JSON.parse(read("examples/.statsig-audit.json"))), []);
  });
});

describe("markdown details", () => {
  it("escapes table-breaking characters", () => {
    assert.equal(md("a|b"), "a\\|b");
    assert.equal(md("x*y [z]"), "x\\*y \\[z\\]");
    assert.equal(md("<script>"), "&lt;script&gt;");
    assert.equal(md("snake_case_id"), "snake_case_id");
    assert.equal(md("_lead"), "\\_lead");
    assert.equal(md("two\nlines"), "two lines");
  });

  it("caps rows per check and points to the JSON report", () => {
    const gates = Array.from({ length: MAX_ROWS + 3 }, (_, i) => gate(`g${String(i).padStart(3, "0")}`, { lastModifiedTime: NOW - 40 * 86400000, rules: [rule("Beta", 20)] }));
    const result = runAudit(snap({ gates }), defaults({ checks: { enable: ["G04"] } }), { now: NOW });
    const text = renderMarkdown(result);
    assert.equal((text.match(/Still partial/g) || []).length, MAX_ROWS);
    assert.match(text, /3 more G04 findings are in the JSON report/);
    assert.equal(JSON.parse(renderJson(result)).findings.length, MAX_ROWS + 3);
  });

  it("rolls findings up by owner only when it adds something", () => {
    const f = (owner) => ({ entity: { type: "gate", owner } });
    assert.equal(ownerRollup([f("A"), f("B"), f("C")]), null);
    assert.equal(ownerRollup([f("A"), f("A"), f("B"), f(null)]), "A (2), B (1), no owner (1)");
  });

  it("says what was read and that nothing was changed", () => {
    const result = runAudit(snap(), defaults(), { now: NOW, requestCount: 12 });
    result.snapshot.source = "console-api";
    assert.match(renderMarkdown(result), /It made 12 GET requests and changed nothing/);
  });
});

describe("snapshot privacy", () => {
  it("drops config values, rule return values and audit log change bodies", () => {
    const s = normalizeSnapshot({
      fetchedAt: "2026-10-14T09:00:00Z",
      gates: [{ id: "g", rules: [{ name: "r", passPercentage: 100, conditions: [], returnValue: { secret: 1 } }] }],
      dynamicConfigs: [{ id: "c", defaultValue: { price: 9 }, defaultValueJson5: "{price: 9}", schema: "{}" }],
      auditLogs: [{ name: "g", actionType: "gate_update", date: "Mon Oct 12 2026", time: "10:00:00 GMT+0000 (Coordinated Universal Time)", changes: { rules: [] }, modifierEmail: "x@example.test" }],
    });
    const text = JSON.stringify(s);
    for (const dropped of ["returnValue", "defaultValue", "schema\":", "changes", "modifierEmail"]) assert.ok(!text.includes(dropped), dropped);
    assert.equal(s.auditLogs[0].timestamp, Date.parse("2026-10-12T10:00:00Z"));
  });
});
