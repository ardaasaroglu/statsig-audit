import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { API_VERSION, ApiError, PAGE_LIMIT, assertReadOnly, createClient, validateBaseUrl } from "../src/client.js";
import { fetchSnapshot } from "../src/fetch-snapshot.js";
import { NOW } from "./helpers/factory.js";
import { page, startMockServer, statsigHandler } from "./helpers/mock-server.js";

const KEY = "console-FAKE-test-key-not-real";
const BASE = "http://127.0.0.1:9/console/v1";

/** A fake clock whose sleep advances time instantly, so timing tests take no real time. */
function fakeClock(start = 1_000_000) {
  let t = start;
  const sleeps = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

/** A fetch stub that answers from a list of responses and records each call. */
function stubFetch(replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = replies.length > 1 ? replies.shift() : replies[0];
    if (next instanceof Error) throw next;
    const { status = 200, body = { message: "ok", data: [] }, headers = {} } = next;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  };
  return { fetch, calls };
}

const quick = (extra = {}) => {
  const clock = fakeClock();
  return { clock, options: { apiKey: KEY, baseUrl: BASE, now: clock.now, sleep: clock.sleep, random: () => 0.5, ...extra } };
};

describe("read-only guard", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post", "HEAD"]) {
    it(`refuses ${method} before any network call`, async () => {
      const { fetch, calls } = stubFetch([{}]);
      const client = createClient({ ...quick().options, fetch });
      await assert.rejects(client.request(method, "/gates"), /only sends GET requests/);
      assert.equal(calls.length, 0);
    });
  }

  it("refuses /keys and code cleanup paths, even with GET", async () => {
    const { fetch, calls } = stubFetch([{}]);
    const client = createClient({ ...quick().options, fetch });
    await assert.rejects(client.get("/keys"), /never calls \/keys/);
    await assert.rejects(client.get("/keys/abc"), /raw API keys/);
    await assert.rejects(client.get("/gates/x/code_cleanup"), /write action/);
    await assert.rejects(client.get("/gates/../keys"), /unexpected path/);
    assert.equal(calls.length, 0);
    assert.throws(() => assertReadOnly("GET", "gates"), /unexpected path/);
  });

  it("sends GET with the key and version headers, never a body, and does not follow redirects", async () => {
    const { fetch, calls } = stubFetch([{ body: { message: "ok", data: [] } }]);
    const client = createClient({ ...quick().options, fetch });
    await client.get("/gates", { page: 1 });
    const { init } = calls[0];
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers["STATSIG-API-KEY"], KEY);
    assert.equal(init.headers["STATSIG-API-VERSION"], API_VERSION);
    assert.equal(API_VERSION, "20240601");
  });
});

describe("base URL", () => {
  it("accepts the official host and loopback test servers", () => {
    assert.equal(validateBaseUrl("https://statsigapi.net/console/v1/"), "https://statsigapi.net/console/v1");
    assert.equal(validateBaseUrl("http://127.0.0.1:4000/console/v1"), "http://127.0.0.1:4000/console/v1");
    assert.equal(validateBaseUrl("http://localhost:4000/x"), "http://localhost:4000/x");
  });
  it("rejects any other host, and plain http to the real API", () => {
    for (const bad of ["http://statsigapi.net/console/v1", "https://statsigapi.net.example.test/", "https://example.test/console/v1", "ftp://127.0.0.1/", "not a url"]) {
      assert.throws(() => validateBaseUrl(bad), Error, bad);
    }
  });
});

describe("pagination", () => {
  let server;
  const items = Array.from({ length: 250 }, (_, i) => ({ id: `g${i}` }));
  let style = "relative";
  before(async () => {
    server = await startMockServer((req) => {
      if (req.path === "/console/v1/weird") {
        const body = page(items, req.query);
        if (body.pagination.nextPage) body.pagination.nextPage = "https://elsewhere.example.test/steal?page=99";
        return { body };
      }
      if (req.path === "/console/v1/nopagination") return { body: { message: "ok", data: items.slice(0, 7) } };
      if (req.path === "/console/v1/empty") return { body: { message: "ok", data: [], pagination: { nextPage: "?page=2" } } };
      return { body: page(items, req.query, { style, path: req.path }) };
    });
  });
  after(() => server.close());

  for (const s of ["relative", "schemeless", "query"]) {
    it(`reads every page and builds page+1 itself (nextPage style: ${s})`, async () => {
      style = s;
      server.requests.length = 0;
      const client = createClient({ apiKey: KEY, baseUrl: server.base, minIntervalMs: 0 });
      const all = await client.getAll("/gates", { includeArchived: "true" });
      assert.equal(all.length, 250);
      assert.deepEqual(server.requests.map((r) => r.query.get("page")), ["1", "2", "3"]);
      for (const r of server.requests) {
        assert.equal(r.query.get("limit"), String(PAGE_LIMIT));
        assert.equal(r.query.get("includeArchived"), "true");
        assert.equal(r.path, "/console/v1/gates");
        assert.equal(r.method, "GET");
      }
    });
  }

  it("never follows a nextPage that points somewhere else", async () => {
    server.requests.length = 0;
    const client = createClient({ apiKey: KEY, baseUrl: server.base, minIntervalMs: 0 });
    assert.equal((await client.getAll("/weird")).length, 250);
    assert.deepEqual(server.requests.map((r) => `${r.path}?${r.query}`), [
      "/console/v1/weird?page=1&limit=100",
      "/console/v1/weird?page=2&limit=100",
      "/console/v1/weird?page=3&limit=100",
    ]);
  });

  it("stops on a short page without pagination metadata, and on an empty page", async () => {
    const client = createClient({ apiKey: KEY, baseUrl: server.base, minIntervalMs: 0 });
    assert.equal((await client.getAll("/nopagination")).length, 7);
    server.requests.length = 0;
    assert.equal((await client.getAll("/empty")).length, 0);
    assert.equal(server.requests.length, 1);
  });
});

describe("throttle", () => {
  it("spaces requests at least 100 ms apart (10 per second)", async () => {
    const { clock, options } = quick();
    const { fetch, calls } = stubFetch([{ body: { message: "ok", data: [] } }]);
    const client = createClient({ ...options, fetch });
    for (let i = 0; i < 5; i++) await client.get("/gates");
    assert.equal(calls.length, 5);
    assert.deepEqual(clock.sleeps, [100, 100, 100, 100]);
  });

  it("waits when the 15-minute window is full", async () => {
    const { clock, options } = quick({ minIntervalMs: 0, windowLimit: 3, windowMs: 60_000 });
    const { fetch } = stubFetch([{ body: { message: "ok", data: [] } }]);
    const client = createClient({ ...options, fetch });
    for (let i = 0; i < 4; i++) await client.get("/gates");
    assert.deepEqual(clock.sleeps, [60_000]);
  });
});

describe("retries", () => {
  it("backs off exponentially with jitter on 5xx and succeeds", async () => {
    const { clock, options } = quick({ minIntervalMs: 0, random: () => 1 });
    const { fetch, calls } = stubFetch([{ status: 503 }, { status: 502 }, { status: 500 }, { body: { message: "ok", data: [1] } }]);
    const client = createClient({ ...options, fetch });
    const body = await client.get("/gates");
    assert.deepEqual(body.data, [1]);
    assert.equal(calls.length, 4);
    assert.deepEqual(clock.sleeps, [1000, 2000, 4000]);
    assert.equal(client.stats.retries, 3);
  });

  it("uses equal jitter: never less than half the ceiling", async () => {
    const { clock, options } = quick({ minIntervalMs: 0, random: () => 0 });
    const { fetch } = stubFetch([{ status: 500 }, { status: 500 }, { body: { message: "ok", data: [] } }]);
    await createClient({ ...options, fetch }).get("/gates");
    assert.deepEqual(clock.sleeps, [500, 1000]);
  });

  it("honors Retry-After on 429", async () => {
    const { clock, options } = quick({ minIntervalMs: 0 });
    const { fetch, calls } = stubFetch([{ status: 429, headers: { "retry-after": "2" } }, { body: { message: "ok", data: [] } }]);
    await createClient({ ...options, fetch }).get("/gates");
    assert.equal(calls.length, 2);
    assert.deepEqual(clock.sleeps, [2000]);
  });

  it("caps retries and reports 429 and 5xx clearly", async () => {
    for (const [status, kind, text] of [[429, "rate_limited", /429 Too Many Requests .* after 4 retries/], [503, "server", /HTTP 503 .* after 4 retries/]]) {
      const { options } = quick({ minIntervalMs: 0 });
      const { fetch, calls } = stubFetch([{ status }]);
      const error = await createClient({ ...options, fetch }).get("/gates").catch((e) => e);
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, kind);
      assert.match(error.message, text);
      assert.equal(calls.length, 5);
    }
  });

  it("retries network errors, then gives up with a clear message", async () => {
    const { options } = quick({ minIntervalMs: 0, maxRetries: 2 });
    const reset = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    const { fetch, calls } = stubFetch([reset]);
    const error = await createClient({ ...options, fetch }).get("/gates").catch((e) => e);
    assert.equal(error.kind, "network");
    assert.match(error.message, /Could not reach Statsig .*ECONNRESET/);
    assert.equal(calls.length, 3);
  });
});

describe("errors", () => {
  const cases = [
    [401, "auth", /rejected the Console API key \(HTTP 401/],
    [403, "forbidden", /may not read GET \/gates \(HTTP 403\)/],
    [404, "not_found", /404 Not Found/],
    [302, "redirect", /Redirects are not followed/],
  ];
  for (const [status, kind, text] of cases) {
    it(`HTTP ${status} fails at once with kind ${kind}, without the key`, async () => {
      const { options } = quick();
      const { fetch, calls } = stubFetch([{ status, body: { status, message: `Invalid key: ${KEY}` }, headers: status === 302 ? { location: "https://elsewhere.example.test/" } : {} }]);
      const error = await createClient({ ...options, fetch }).get("/gates").catch((e) => e);
      assert.equal(error.kind, kind);
      assert.match(error.message, text);
      assert.ok(!error.message.includes(KEY));
      assert.equal(calls.length, 1);
    });
  }

  it("removes the key from an echoed error body", async () => {
    const { options } = quick();
    const { fetch } = stubFetch([{ status: 400, body: { message: `bad request for key ${KEY}` } }]);
    const error = await createClient({ ...options, fetch }).get("/gates").catch((e) => e);
    assert.equal(error.kind, "http");
    assert.match(error.message, /\[redacted\]/);
    assert.ok(!error.message.includes(KEY));
  });

  it("rejects a response that is not JSON", async () => {
    const { options } = quick();
    const { fetch } = stubFetch([{ body: "<html>maintenance</html>" }]);
    const error = await createClient({ ...options, fetch }).get("/gates").catch((e) => e);
    assert.equal(error.kind, "bad_response");
  });
});

describe("fetchSnapshot", () => {
  let server;
  const project = {
    gates: [
      { id: "quiet", status: "In Progress", type: "TEMPORARY", checksPerHour: 0, createdTime: NOW - 30 * 86400000 },
      { id: "busy", status: "In Progress", type: "TEMPORARY", checksPerHour: 50 },
    ],
    experiments: [{ id: "e1", status: "active", targetExposures: 1000 }, { id: "e2", status: "active" }],
  };
  const forbidden = () => ({ status: 403, body: { status: 403, message: "Forbidden resource" } });
  before(async () => {
    server = await startMockServer(
      statsigHandler(project, {
        "/console/v1/holdouts": forbidden,
        "/console/v1/experiments/e1/cumulative_exposures": () => ({ body: { message: "ok", data: [{ groupID: "a", groupName: "A", results: [{ date: "2026-10-13", exposures: 1200 }] }] } }),
      }),
    );
  });
  after(() => server.close());

  it("reads every list with GET only, skips a forbidden optional list, and never reads /keys or /users unasked", async () => {
    server.requests.length = 0;
    const client = createClient({ apiKey: KEY, baseUrl: server.base, minIntervalMs: 0 });
    const snapshot = await fetchSnapshot(client, { now: NOW, auditLogDays: 30, deep: false, users: false });
    const paths = [...new Set(server.requests.map((r) => r.path))];
    assert.ok(server.requests.every((r) => r.method === "GET"));
    assert.ok(!paths.some((p) => p.includes("/keys") || p.includes("/users") || p.includes("code_cleanup")));
    for (const p of ["/gates", "/experiments", "/dynamic_configs", "/segments", "/metrics/list", "/layers", "/holdouts", "/tags", "/audit_logs", "/settings/reviews"]) {
      assert.ok(paths.includes(`/console/v1${p}`), p);
    }
    const gatesReq = server.requests.find((r) => r.path === "/console/v1/gates");
    assert.equal(gatesReq.query.get("includeArchived"), "true");
    assert.equal(server.requests.find((r) => r.path === "/console/v1/metrics/list").query.get("showHiddenMetrics"), "true");
    const audit = server.requests.find((r) => r.path === "/console/v1/audit_logs");
    assert.equal(audit.query.get("startDate"), "2026-09-14");
    assert.equal(audit.query.get("endDate"), "2026-10-14");
    assert.equal(snapshot.holdouts, null);
    assert.equal(snapshot.unavailable.holdouts, "HTTP 403");
    assert.equal(snapshot.users, null);
    assert.equal(snapshot.gates.length, 2);
    assert.equal(snapshot.source, "console-api");
    assert.ok(server.requests.every((r) => r.headers["statsig-api-key"] === KEY && r.headers["statsig-api-version"] === "20240601"));
  });

  it("with --deep, makes detail calls only for candidates; with --users, reads members", async () => {
    server.requests.length = 0;
    const client = createClient({ apiKey: KEY, baseUrl: server.base, minIntervalMs: 0 });
    const snapshot = await fetchSnapshot(client, { now: NOW, auditLogDays: 7, deep: true, users: true });
    const paths = server.requests.map((r) => r.path);
    assert.ok(paths.includes("/console/v1/gates/quiet/checks"));
    assert.ok(!paths.includes("/console/v1/gates/busy/checks"));
    assert.ok(paths.includes("/console/v1/experiments/e1/cumulative_exposures"));
    assert.ok(!paths.includes("/console/v1/experiments/e2/cumulative_exposures"));
    assert.ok(paths.includes("/console/v1/users"));
    assert.equal(snapshot.details.gateChecks.quiet.has_production_checks_in_last_7_days, false);
    assert.equal(snapshot.details.cumulativeExposures.e1[0].results[0].exposures, 1200);
  });

  it("stops when a required list is forbidden", async () => {
    const s = await startMockServer(statsigHandler({}, { "/console/v1/gates": forbidden }));
    try {
      const client = createClient({ apiKey: KEY, baseUrl: s.base, minIntervalMs: 0 });
      await assert.rejects(fetchSnapshot(client, { now: NOW }), (e) => e.kind === "forbidden");
    } finally {
      await s.close();
    }
  });
});
