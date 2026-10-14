// Every check gets at least one fixture that must produce a finding and one that must not.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHECKS, getCheck } from "../src/checks/index.js";
import { singleOutcome } from "../src/checks/g03-single-outcome.js";
import { editDistance } from "../src/checks/g09-suspicious-values.js";
import { totalExposures } from "../src/checks/e03-past-plan.js";
import { NOW, ago, cond, config, defaults, everyone, experiment, gate, metric, rule, segment, snap } from "./helpers/factory.js";

const run = (id, snapshot, cfg = defaults()) => getCheck(id).run(snapshot, cfg, NOW);
const ids = (findings) => findings.map((f) => f.entity.id).sort();

describe("check catalog", () => {
  it("has 25 checks with unique ids and complete metadata", () => {
    assert.equal(CHECKS.length, 25);
    assert.equal(new Set(CHECKS.map((c) => c.id)).size, 25);
    for (const c of CHECKS) {
      assert.match(c.id, /^[A-Z]\d{2}$/);
      for (const key of ["title", "rationale", "action", "overlap"]) assert.ok(typeof c[key] === "string" && c[key].length > 10, `${c.id}.${key}`);
      assert.ok(["high", "medium", "low"].includes(c.severity), c.id);
      assert.ok(Array.isArray(c.appliesTo) && c.appliesTo.length, `${c.id}.appliesTo`);
      assert.ok(Array.isArray(c.requires) && c.requires.length, `${c.id}.requires`);
      assert.equal(typeof c.run, "function");
    }
  });

  it("never uses an em dash or en dash in user-facing text", () => {
    for (const c of CHECKS) {
      for (const key of ["title", "rationale", "action", "overlap"]) {
        assert.doesNotMatch(c[key], /[\u2013\u2014]/, `${c.id}.${key}`);
      }
    }
  });
});

describe("G01 stale gates", () => {
  it("reports gates Statsig marked stale, with the reason and the date from the audit log", () => {
    const s = snap({
      gates: [gate("old", { type: "STALE", typeReason: "STALE_PROBABLY_DEAD_CHECK", lastModifiedTime: ago(90) })],
      auditLogs: [{ name: "old", actionType: "gate_stale_status_update", date: "Fri Oct 02 2026", time: "10:00:00 GMT+0000 (Coordinated Universal Time)" }],
    });
    const [f] = run("G01", s);
    assert.match(f.message, /no checks in the last 30 days/);
    assert.match(f.message, /90 days ago/);
    assert.match(f.message, /2026-10-02/);
    assert.match(f.action, /archive/);
  });
  it("ignores temporary, permanent and archived gates", () => {
    const s = snap({
      gates: [gate("a"), gate("b", { type: "PERMANENT" }), gate("c", { type: "STALE", typeReason: "STALE_NO_RULES", status: "Archived" })],
    });
    assert.deepEqual(run("G01", s), []);
  });
});

describe("G02 launched or disabled, not cleaned up", () => {
  it("reports launched and disabled gates past the window", () => {
    const s = snap({ gates: [gate("l", { status: "Launched", lastModifiedTime: ago(61) }), gate("d", { status: "Disabled", lastModifiedTime: ago(80) })] });
    const f = run("G02", s);
    assert.deepEqual(ids(f), ["d", "l"]);
    assert.match(f.find((x) => x.entity.id === "l").message, /returns true/);
  });
  it("skips recent, permanent and already-stale gates, and respects the threshold", () => {
    const s = snap({
      gates: [
        gate("recent", { status: "Launched", lastModifiedTime: ago(10) }),
        gate("perm", { status: "Launched", type: "PERMANENT", lastModifiedTime: ago(200) }),
        gate("stale", { status: "Launched", type: "STALE", typeReason: "STALE_PROBABLY_LAUNCHED", lastModifiedTime: ago(200) }),
        gate("inprog", { lastModifiedTime: ago(200) }),
      ],
    });
    assert.deepEqual(run("G02", s), []);
    const s2 = snap({ gates: [gate("l", { status: "Launched", lastModifiedTime: ago(61) })] });
    assert.deepEqual(run("G02", s2, defaults({ thresholds: { gateCleanupDays: 90 } })), []);
  });
});

describe("G03 single outcome", () => {
  it("finds pass-all, fail-all and no-rule gates", () => {
    const s = snap({
      gates: [
        gate("all", { lastModifiedTime: ago(40), rules: [rule("Everyone", 100)] }),
        gate("none", { lastModifiedTime: ago(40), rules: [] }),
        gate("zero", { lastModifiedTime: ago(40), rules: [rule("A", 0, [cond("user_id", "any", ["1"])]), rule("B", 0, [cond("email", "any", ["x@example.test"])])] }),
      ],
    });
    assert.deepEqual(ids(run("G03", s)), ["all", "none", "zero"]);
  });
  it("leaves mixed, partial, recent and environment-scoped gates alone", () => {
    const s = snap({
      gates: [
        gate("mixed", { lastModifiedTime: ago(40), rules: [rule("Off", 0, [cond("user_id", "any", ["1"])]), rule("Everyone", 100)] }),
        gate("partial", { lastModifiedTime: ago(40), rules: [rule("Everyone", 50)] }),
        gate("recent", { lastModifiedTime: ago(3), rules: [rule("Everyone", 100)] }),
        gate("env", { lastModifiedTime: ago(40), rules: [rule("Prod", 100, everyone(), { environments: ["production"] })] }),
        gate("targeted", { lastModifiedTime: ago(40), rules: [rule("Staff", 100, [cond("email", "any", ["a@example.test"])])] }),
      ],
    });
    assert.deepEqual(run("G03", s), []);
  });
  it("singleOutcome stops at the first everyone rule", () => {
    assert.equal(singleOutcome([rule("A", 100, [cond("user_id", "any", ["1"])]), rule("Everyone", 100), rule("Late", 0)]).value, true);
    assert.equal(singleOutcome([rule("A", 100, [cond("user_id", "any", ["1"])])]), null);
  });
});

describe("G04 partial rollout left alone", () => {
  it("reports a partial rule unchanged for 30 days", () => {
    const [f] = run("G04", snap({ gates: [gate("p", { lastModifiedTime: ago(45), rules: [rule("Beta", 25)] })] }));
    assert.match(f.message, /rule "Beta" at 25%/);
    assert.match(f.message, /45 days/);
  });
  it("skips scheduled rollouts, recent changes and full rules", () => {
    const s = snap({
      gates: [
        gate("scheduled", { lastModifiedTime: ago(45), rules: [rule("Beta", 25, everyone(), { pendingAutomatedRollouts: [{ time: NOW + 86400000, passPercent: 50 }] })] }),
        gate("recent", { lastModifiedTime: ago(5), rules: [rule("Beta", 25)] }),
        gate("full", { lastModifiedTime: ago(45), rules: [rule("Staff", 100, [cond("user_id", "any", ["1"])])] }),
      ],
    });
    assert.deepEqual(run("G04", s), []);
  });
});

describe("G06 zero traffic", () => {
  it("reports zero-check gates and says when --deep would confirm", () => {
    const [f] = run("G06", snap({ gates: [gate("quiet", { checksPerHour: 0, createdTime: ago(30) })] }));
    assert.match(f.message, /--deep/);
  });
  it("uses the 7-day production check record when it was read", () => {
    const s = snap({
      gates: [gate("dead", { checksPerHour: 0, createdTime: ago(30) }), gate("alive", { checksPerHour: 0, createdTime: ago(30) })],
      collected: { deep: true },
      details: { gateChecks: { dead: { has_production_checks_in_last_7_days: false }, alive: { has_production_checks_in_last_7_days: true } } },
    });
    const f = run("G06", s);
    assert.deepEqual(ids(f), ["dead"]);
    assert.match(f[0].message, /confirmed by Statsig/);
  });
  it("skips new gates, gates with traffic, unknown rates and stale gates", () => {
    const s = snap({
      gates: [
        gate("new", { checksPerHour: 0, createdTime: ago(2) }),
        gate("busy", { checksPerHour: 12 }),
        gate("unknown", { checksPerHour: null }),
        gate("stale", { checksPerHour: 0, type: "STALE", typeReason: "STALE_PROBABLY_DEAD_CHECK" }),
      ],
    });
    assert.deepEqual(run("G06", s), []);
  });
});

describe("G08 empty conditions", () => {
  it("reports empty value lists and says what they match", () => {
    const s = snap({
      gates: [gate("g", { rules: [rule("Pilot", 100, [cond("custom_field", "any", [], { field: "store_id" })]), rule("Not", 100, [cond("email", "none", [""])])] })],
      dynamicConfigs: [config("c", { rules: [rule("Ref", 100, [cond("passes_segment", null, [])])] })],
    });
    const f = run("G08", s);
    assert.equal(f.length, 3);
    assert.match(f[0].message, /matches no user/);
    assert.match(f[1].message, /matches every user/);
    assert.match(f[2].message, /names no segment/);
  });
  it("accepts filled values, public conditions, null operators and launched gates", () => {
    const s = snap({
      gates: [
        gate("ok", { rules: [rule("A", 100, [cond("user_id", "any", ["1"])]), rule("B", 100, [cond("email", "is_null", null)]), rule("All", 100)] }),
        gate("launched", { status: "Launched", rules: [rule("A", 100, [cond("user_id", "any", [])])] }),
      ],
    });
    assert.deepEqual(run("G08", s), []);
  });
});

describe("G09 suspicious values", () => {
  it("reports spaces, quotes, pasted lists, domain typos and duplicates with the right severity", () => {
    const emails = ["a@shop.test", "b@shop.test", "c@shop.test", " d@shop.test", "e@sho.test", '"f@shop.test"', "a@shop.test"];
    const s = snap({
      gates: [
        gate("g", { rules: [rule("Staff", 100, [cond("email", "any", emails)])] }),
        gate("ids", { rules: [rule("Pilot", 100, [cond("user_id", "any", ["12, 13"])])] }),
        gate("dupes", { rules: [rule("Pilot", 100, [cond("user_id", "any", ["7", "7"])])] }),
      ],
    });
    const f = run("G09", s);
    const byId = Object.fromEntries(f.map((x) => [x.entity.id, x]));
    assert.equal(byId.g.severity, "high");
    assert.match(byId.g.message, /leading or trailing spaces/);
    assert.match(byId.g.message, /quote marks/);
    assert.match(byId.g.message, /one letter away from shop\.test/);
    assert.match(byId.g.message, /duplicate values/);
    assert.match(byId.ids.message, /several IDs pasted into one value/);
    assert.equal(byId.dupes.severity, "low");
  });
  it("accepts clean values", () => {
    const s = snap({ gates: [gate("g", { rules: [rule("Staff", 100, [cond("email", "any", ["a@shop.test", "b@shop.test"])])] })] });
    assert.deepEqual(run("G09", s), []);
  });
  it("editDistance counts single edits", () => {
    assert.equal(editDistance("shop.test", "shpo.test"), 2);
    assert.equal(editDistance("shop.test", "sho.test"), 1);
    assert.equal(editDistance("same", "same"), 0);
  });
});

describe("G10 duplicated allowlists", () => {
  const list = ["1", "2", "3", "4", "5", "6"];
  it("reports the same list in two entities", () => {
    const s = snap({
      gates: [gate("a", { rules: [rule("Pilot", 100, [cond("user_id", "any", list)])] })],
      dynamicConfigs: [config("b", { rules: [rule("Pilot", 100, [cond("user_id", "any", [...list].reverse())])] })],
    });
    const [f] = run("G10", s);
    assert.equal(f.entity.id, "b");
    assert.equal(f.related[0].id, "a");
    assert.match(f.message, /6 user_id values also appear in gate a/);
  });
  it("ignores short lists, different lists and repeats inside one entity", () => {
    const s = snap({
      gates: [
        gate("a", { rules: [rule("P", 100, [cond("user_id", "any", ["1", "2"])])] }),
        gate("b", { rules: [rule("P", 100, [cond("user_id", "any", ["1", "2"])])] }),
        gate("c", { rules: [rule("P", 100, [cond("user_id", "any", list)]), rule("Q", 100, [cond("user_id", "any", list)])] }),
        gate("d", { rules: [rule("P", 100, [cond("user_id", "any", [...list, "7"])])] }),
      ],
    });
    assert.deepEqual(run("G10", s), []);
  });
});

describe("G11 unreachable rules", () => {
  it("reports rules after an everyone rule, at any pass percentage", () => {
    const s = snap({ gates: [gate("g", { rules: [rule("Everyone", 10), rule("Staff", 100, [cond("user_id", "any", ["1"])])] })] });
    const [f] = run("G11", s);
    assert.match(f.message, /the rule after it never runs: rule "Staff"/);
  });
  it("accepts an everyone rule at the end or scoped to an environment", () => {
    const s = snap({
      gates: [
        gate("end", { rules: [rule("Staff", 100, [cond("user_id", "any", ["1"])]), rule("Everyone", 10)] }),
        gate("env", { rules: [rule("Prod", 100, everyone(), { environments: ["production"] }), rule("Staff", 100, [cond("user_id", "any", ["1"])])] }),
      ],
    });
    assert.deepEqual(run("G11", s), []);
  });
});

describe("G12 dangling references", () => {
  it("reports missing and archived gates, missing and disabled segments, missing layers and holdout targets", () => {
    const s = snap({
      gates: [
        gate("g", {
          rules: [
            rule("A", 100, [cond("passes_gate", null, ["gone"])]),
            rule("B", 100, [cond("fails_gate", null, "old")]),
            rule("C", 100, [cond("passes_segment", null, ["missing_seg"])]),
            rule("D", 100, [cond("passes_segment", null, ["off_seg"])]),
          ],
        }),
        gate("old", { status: "Archived" }),
      ],
      segments: [segment("off_seg", { isEnabled: false })],
      experiments: [experiment("e", { layerID: "no_layer" })],
      holdouts: [{ id: "h", isEnabled: true, gateIDs: ["old"], experimentIDs: ["nope"], layerIDs: [] }],
    });
    const f = run("G12", s);
    assert.equal(f.length, 7);
    const text = f.map((x) => x.message).join("\n");
    assert.match(text, /gate gone, which does not exist/);
    assert.match(text, /gate old, which is archived/);
    assert.match(text, /segment missing_seg, which does not exist/);
    assert.match(text, /segment off_seg, which is disabled/);
    assert.match(text, /layer no_layer, which does not exist/);
    assert.match(text, /holds out gate old, which is archived/);
    assert.match(text, /holds out experiment nope, which does not exist/);
  });
  it("accepts live references and says when archived gates were not collected", () => {
    const ok = snap({
      gates: [gate("g", { rules: [rule("A", 100, [cond("passes_gate", null, ["h"])]), rule("B", 100, [cond("passes_segment", null, ["s"])])] }), gate("h")],
      segments: [segment("s")],
      layers: [{ id: "l" }],
      experiments: [experiment("e", { layerID: "l" })],
    });
    assert.deepEqual(run("G12", ok), []);
    const partial = snap({ gates: [gate("g", { rules: [rule("A", 100, [cond("passes_gate", null, ["x"])])] })], collected: { includesArchivedGates: false } });
    assert.match(run("G12", partial)[0].message, /may be archived/);
  });
});

describe("G13 missing metadata", () => {
  it("reports missing description, owner, API-key owner and tags", () => {
    const s = snap({
      gates: [gate("bare", { description: "", owner: null, tags: [] }), gate("api", { owner: { ownerType: "SDK_KEY", ownerName: "CONSOLE API", ownerID: "k" } })],
      metrics: [metric("m", "sum", { description: "" })],
    });
    const f = run("G13", s);
    const byId = Object.fromEntries(f.map((x) => [x.entity.id, x.message]));
    assert.match(byId.bare, /no description, no owner and no tags/);
    assert.match(byId.api, /an API key as owner/);
    assert.match(byId["m::sum"], /no description/);
  });
  it("skips built-in metrics, archived entities, and tags when the project uses none", () => {
    const s = snap({
      gates: [gate("old", { description: "", status: "Archived" }), gate("untagged", { tags: [] })],
      metrics: [metric("dau", "user", { description: "", isVerified: false, tags: [] })],
    });
    assert.deepEqual(run("G13", s), []);
  });
});

describe("G14 owners who left", () => {
  it("reports owners missing from the member list", () => {
    const s = snap({
      gates: [gate("g", { owner: { ownerID: "u_gone", ownerType: "USER", ownerName: "Former Owner", ownerEmail: "former@example.test" } })],
      users: [{ userID: "u_test", email: "test.owner@example.test" }],
    });
    const [f] = run("G14", s);
    assert.match(f.message, /Former Owner is not in the project member list/);
  });
  it("matches members by id or email and skips API-key owners", () => {
    const s = snap({
      gates: [
        gate("by_id"),
        gate("by_email", { owner: { ownerID: "other", ownerType: "USER", ownerName: "Test Owner", ownerEmail: "TEST.OWNER@example.test" } }),
        gate("api", { owner: { ownerType: "SDK_KEY", ownerID: "k" } }),
      ],
      users: [{ userID: "u_test", email: "test.owner@example.test" }],
    });
    assert.deepEqual(run("G14", s), []);
  });
});

describe("D01 stale dynamic configs", () => {
  it("reports configs Statsig marked stale", () => {
    const [f] = run("D01", snap({ dynamicConfigs: [config("c", { type: "STALE", typeReason: "STALE_NO_RULES", lastModifiedTime: ago(70) })] }));
    assert.match(f.message, /no rules/);
    assert.match(f.action, /default value/);
  });
  it("ignores temporary and archived configs", () => {
    const s = snap({ dynamicConfigs: [config("a"), config("b", { type: "STALE", typeReason: "STALE_NO_RULES", status: "Archived" })] });
    assert.deepEqual(run("D01", s), []);
  });
});

describe("E02 decided, not cleaned up", () => {
  it("reports decided and abandoned experiments past the window, naming the shipped group", () => {
    const s = snap({
      experiments: [
        experiment("won", { status: "decision_made", decisionTime: ago(40), launchedGroupID: "t" }),
        experiment("dropped", { status: "abandoned", decisionTime: ago(35) }),
      ],
    });
    const f = run("E02", s);
    assert.deepEqual(ids(f), ["dropped", "won"]);
    assert.match(f.find((x) => x.entity.id === "won").message, /shipped "Test"/);
  });
  it("skips recent decisions, running and archived experiments", () => {
    const s = snap({
      experiments: [
        experiment("recent", { status: "decision_made", decisionTime: ago(5) }),
        experiment("running"),
        experiment("archived", { status: "archived", decisionTime: ago(300) }),
      ],
    });
    assert.deepEqual(run("E02", s), []);
  });
});

describe("E03 past plan", () => {
  it("reports experiments past their duration or with no plan for too long", () => {
    const s = snap({
      experiments: [experiment("late", { startTime: ago(40), duration: 14 }), experiment("noplan", { startTime: ago(70), duration: null })],
    });
    const f = run("E03", s);
    assert.match(f.find((x) => x.entity.id === "late").message, /Planned for 14 days and running for 40, 26 days over/);
    assert.match(f.find((x) => x.entity.id === "noplan").message, /No planned duration and running for 70 days/);
  });
  it("reports an experiment that reached its exposure target when exposures were read", () => {
    const s = snap({
      experiments: [experiment("full", { startTime: ago(3), duration: 30, targetExposures: 1000 })],
      details: { cumulativeExposures: { full: [{ groupID: "c", results: [{ date: "2026-10-12", exposures: 400 }, { date: "2026-10-13", exposures: 600 }] }, { groupID: "t", results: [{ date: "2026-10-13", exposures: 500 }] }] } },
    });
    assert.match(run("E03", s)[0].message, /Reached its target of 1,000 exposures \(1,100 so far\)/);
  });
  it("leaves on-plan, unstarted and stopped experiments alone", () => {
    const s = snap({
      experiments: [
        experiment("ok", { startTime: ago(5), duration: 14 }),
        experiment("setup", { status: "setup", startTime: null }),
        experiment("decided", { status: "decision_made", startTime: ago(200) }),
        experiment("under", { startTime: ago(3), duration: 30, targetExposures: 5000 }),
      ],
      details: { cumulativeExposures: { under: [{ groupID: "c", results: [{ date: "2026-10-13", exposures: 100 }] }] } },
    });
    assert.deepEqual(run("E03", s), []);
    assert.equal(totalExposures([]), null);
  });
});

describe("E04 setup defects", () => {
  it("reports missing pieces, high when running and medium in setup", () => {
    const s = snap({
      experiments: [
        experiment("running", { hypothesis: "short", secondaryMetrics: [] }),
        experiment("draft", { status: "setup", hypothesis: "", primaryMetrics: [] }),
        experiment("soup", { primaryMetrics: Array.from({ length: 7 }, (_, i) => ({ name: `m${i}`, type: "sum" })) }),
      ],
    });
    const f = Object.fromEntries(run("E04", s).map((x) => [x.entity.id, x]));
    assert.equal(f.running.severity, "high");
    assert.match(f.running.message, /a 5-character hypothesis and no secondary or guardrail metrics/);
    assert.equal(f.draft.severity, "medium");
    assert.match(f.draft.message, /no hypothesis and no primary metric/);
    assert.match(f.soup.message, /7 primary metrics, more than 5/);
  });
  it("accepts a well-formed experiment and ignores decided ones", () => {
    const s = snap({ experiments: [experiment("good"), experiment("done", { status: "decision_made", hypothesis: "" })] });
    assert.deepEqual(run("E04", s), []);
  });
});

describe("E05 multiple comparisons", () => {
  it("reports several primaries or groups without correction", () => {
    const s = snap({
      experiments: [
        experiment("multi", { primaryMetrics: [{ name: "a", type: "sum" }, { name: "b", type: "sum" }] }),
        experiment("arms", { groups: [{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C" }] }),
      ],
    });
    assert.deepEqual(ids(run("E05", s)), ["arms", "multi"]);
  });
  it("accepts corrected or simple experiments, and ignores disabled groups", () => {
    const s = snap({
      experiments: [
        experiment("fixed", { primaryMetrics: [{ name: "a", type: "sum" }, { name: "b", type: "sum" }], benjaminiHochbergPerMetric: true }),
        experiment("simple"),
        experiment("trimmed", { groups: [{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C", disabled: true }] }),
      ],
    });
    assert.deepEqual(run("E05", s), []);
  });
});

describe("E06 health checks", () => {
  it("reports failed as high and warnings as medium, naming the checks", () => {
    const s = snap({
      experiments: [
        experiment("bad", { healthCheckStatus: "FAILED", healthChecks: [{ name: "Exposures are balanced", status: "FAILED" }, { name: "Has data", status: "PASSED" }] }),
        experiment("meh", { healthCheckStatus: "WARNING", healthChecks: [{ name: "Crossover", status: "WARNING" }] }),
      ],
    });
    const f = Object.fromEntries(run("E06", s).map((x) => [x.entity.id, x]));
    assert.equal(f.bad.severity, "high");
    assert.match(f.bad.message, /Exposures are balanced \(failed\)/);
    assert.doesNotMatch(f.bad.message, /Has data/);
    assert.equal(f.meh.severity, "medium");
  });
  it("ignores passing and not-running experiments", () => {
    const s = snap({ experiments: [experiment("ok"), experiment("draft", { status: "setup", healthCheckStatus: "FAILED" })] });
    assert.deepEqual(run("E06", s), []);
  });
});

describe("E09 targeting gate", () => {
  it("reports missing, archived, disabled, all-false and pass-nobody targeting gates", () => {
    const s = snap({
      gates: [
        gate("arch", { status: "Archived" }),
        gate("off", { status: "Disabled" }),
        gate("allfalse", { type: "STALE", typeReason: "STALE_ALL_FALSE" }),
        gate("norules", { rules: [] }),
      ],
      experiments: ["missing", "arch", "off", "allfalse", "norules"].map((g) => experiment(`e_${g}`, { targetingGateID: g })),
    });
    const f = run("E09", s);
    assert.equal(f.length, 5);
    assert.match(f.find((x) => x.entity.id === "e_norules").message, /has no rules/);
  });
  it("accepts a healthy targeting gate and experiments without one", () => {
    const s = snap({ gates: [gate("live")], experiments: [experiment("a", { targetingGateID: "live" }), experiment("b")] });
    assert.deepEqual(run("E09", s), []);
  });
});

describe("X01 empty layers", () => {
  it("reports explicit layers with no experiment that is not archived", () => {
    const s = snap({ layers: [{ id: "unused" }, { id: "archived_only" }], experiments: [experiment("old", { status: "archived", layerID: "archived_only" })] });
    assert.deepEqual(ids(run("X01", s)), ["archived_only", "unused"]);
  });
  it("skips used and implicit layers", () => {
    const s = snap({ layers: [{ id: "used" }, { id: "statsig::x", isImplicitLayer: true }], experiments: [experiment("e", { layerID: "used" })] });
    assert.deepEqual(run("X01", s), []);
  });
});

describe("X02 unused segments", () => {
  it("reports unreferenced segments and empty ID lists", () => {
    const s = snap({ segments: [segment("lonely"), segment("empty", { count: 0 })], gates: [gate("g", { rules: [rule("E", 100, [cond("passes_segment", null, ["empty"])])] })] });
    const f = Object.fromEntries(run("X02", s).map((x) => [x.entity.id, x.message]));
    assert.match(f.lonely, /references it/);
    assert.match(f.empty, /ID list is empty/);
    assert.doesNotMatch(f.empty, /references it/);
  });
  it("counts references from launched gates, configs and other segments", () => {
    const s = snap({
      segments: [segment("a"), segment("b"), segment("c", { type: "rule_based", rules: [rule("Inner", 100, [cond("passes_segment", null, ["d"])])] }), segment("d")],
      gates: [gate("g", { status: "Launched", rules: [rule("A", 100, [cond("passes_segment", null, ["a"])])] })],
      dynamicConfigs: [config("cfg", { rules: [rule("B", 100, [cond("fails_segment", null, ["b", "c"])])] })],
    });
    assert.deepEqual(run("X02", s), []);
  });
});

describe("X03 metric trust", () => {
  it("reports unverified, hidden and missing primary metrics of running experiments", () => {
    const s = snap({
      metrics: [metric("conv", "ratio", { isVerified: false }), metric("size", "mean", { isHidden: true })],
      experiments: [
        experiment("a", { primaryMetrics: [{ name: "conv", type: "ratio" }, { name: "size", type: "mean" }] }),
        experiment("b", { primaryMetrics: [{ name: "conv", type: "ratio" }, { name: "gone", type: "sum" }] }),
      ],
    });
    const f = run("X03", s);
    const conv = f.find((x) => x.entity.id === "conv::ratio");
    assert.match(conv.message, /Not verified, and it is a primary metric of 2 running experiments: a and b/);
    assert.match(f.find((x) => x.entity.id === "size::mean").message, /Hidden from the catalog/);
    assert.match(f.find((x) => x.entity.id === "b").message, /gone \(sum\) is not in the metric catalog/);
  });
  it("skips verified, built-in and event metrics, and experiments not running", () => {
    const s = snap({
      metrics: [metric("ok", "sum"), metric("dau", "user", { isVerified: false })],
      experiments: [
        experiment("a", { primaryMetrics: [{ name: "ok", type: "sum" }, { name: "dau", type: "user" }, { name: "page_view", type: "event_count" }] }),
        experiment("b", { status: "decision_made", primaryMetrics: [{ name: "missing", type: "ratio" }] }),
      ],
    });
    assert.deepEqual(run("X03", s), []);
  });
});

describe("A01 rule churn", () => {
  const log = (name, daysAgo, actionType = "config_conditions_update", who = "u1") => {
    const d = new Date(NOW - daysAgo * 86400000);
    return { name, actionType, updatedByUserID: who, timestamp: d.getTime() };
  };
  it("reports entities changed often in the window, high when nothing requires review", () => {
    const s = snap({
      gates: [gate("hot", { reviewSettings: { requiredReview: false } })],
      auditLogs: [1, 1.5, 2, 3, 4, 5].map((d, i) => log("hot", d, i % 2 ? "gate_update" : "config_conditions_update", `u${i % 3}`)),
      reviewSettings: { is_config_review_required: false, is_metric_review_required: true },
    });
    const [f] = run("A01", s);
    assert.equal(f.severity, "high");
    assert.match(f.message, /6 rule or state changes in the last 7 days, by 3 people/);
  });
  it("is medium when reviews are required, and ignores old or unrelated entries", () => {
    const reviewed = snap({ gates: [gate("hot")], auditLogs: [1, 2, 3, 4, 5].map((d) => log("hot", d)) });
    assert.equal(run("A01", reviewed)[0].severity, "medium");
    const quiet = snap({
      gates: [gate("calm")],
      auditLogs: [...[10, 11, 12, 13, 14].map((d) => log("calm", d)), ...[1, 2, 3, 4, 5].map((d) => log("calm", d, "config_add_tag")), ...[1, 2, 3, 4, 5].map((d) => log("deleted_gate", d))],
    });
    assert.deepEqual(run("A01", quiet), []);
  });
});

describe("A02 review settings", () => {
  it("reports when config and metric reviews are off", () => {
    const f = run("A02", snap({ reviewSettings: { is_config_review_required: false, is_metric_review_required: false } }));
    assert.equal(f.length, 2);
    assert.equal(f[0].severity, undefined);
    assert.equal(f[1].severity, "low");
  });
  it("is quiet when reviews are required", () => {
    assert.deepEqual(run("A02", snap()), []);
  });
});

describe("N01 naming and tags", () => {
  it("reports scratch ids, ids off pattern, unknown tags and unused tags", () => {
    const s = snap({
      gates: [gate("test_checkout"), gate("Checkout-V2"), gate("promo_copy2"), gate("fine_name", { tags: ["mystery"] })],
      tags: [{ id: "1", name: "tests" }, { id: "2", name: "unused_tag" }, { id: "3", name: "core", isCore: true }],
    });
    const f = run("N01", s);
    const text = f.map((x) => `${x.entity.id}: ${x.message}`).join("\n");
    assert.match(text, /test_checkout: Its id looks like a scratch/);
    assert.match(text, /promo_copy2: Its id looks like a scratch/);
    assert.match(text, /Checkout-V2: Its id does not match the naming pattern/);
    assert.match(text, /not in the tag list: mystery/);
    assert.match(text, /no entity uses: unused_tag/);
    assert.doesNotMatch(text, /core/);
  });
  it("accepts ordinary ids, including ones that mention copy, and honors a custom or disabled pattern", () => {
    const s = snap({ gates: [gate("checkout_copy"), gate("button_copy_test")], tags: null });
    assert.deepEqual(run("N01", s), []);
    const custom = snap({ gates: [gate("Checkout-V2")], tags: null });
    assert.deepEqual(run("N01", custom, defaults({ naming: { pattern: null } })), []);
    assert.equal(run("N01", custom, defaults({ naming: { pattern: "^[a-z]+$" } })).length, 1);
  });
});
