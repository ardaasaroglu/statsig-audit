// A local stand-in for the Console API. It listens on 127.0.0.1 only and records every
// request, so tests can assert on methods, paths, query strings and headers.

import { createServer } from "node:http";

/**
 * @param {(req: { method: string, path: string, query: URLSearchParams, headers: object }) =>
 *   ({ status?: number, headers?: object, body?: unknown } | "destroy")} handler
 */
export async function startMockServer(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const record = { method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers };
    requests.push(record);
    let reply;
    try {
      reply = handler(record);
    } catch (error) {
      reply = { status: 500, body: { message: String(error) } };
    }
    if (reply === "destroy") {
      req.socket.destroy();
      return;
    }
    const status = reply.status ?? 200;
    const body = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {});
    res.writeHead(status, { "content-type": "application/json", ...(reply.headers || {}) });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}/console/v1`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

/** Paginates an array like the Console API does. nextPage formats vary on purpose. */
export function page(items, query, { style = "relative", path = "/console/v1/x" } = {}) {
  const p = Number(query.get("page") || 1);
  const limit = Number(query.get("limit") || 10);
  const slice = items.slice((p - 1) * limit, p * limit);
  const more = p * limit < items.length;
  const next = {
    relative: `${path}?page=${p + 1}&limit=${limit}`,
    schemeless: `statsigapi.net${path}?page=${p + 1}&limit=${limit}`,
    query: `?page=${p + 1}&limit=${limit}`,
  }[style];
  return {
    message: "listed",
    data: slice,
    pagination: { itemsPerPage: limit, pageNumber: p, nextPage: more ? next : null, previousPage: p > 1 ? "x" : null, totalItems: items.length },
  };
}

/** A whole fake project behind the mock server. `overrides` maps a path to a reply function. */
export function statsigHandler(project, overrides = {}) {
  const lists = {
    "/console/v1/gates": project.gates || [],
    "/console/v1/experiments": project.experiments || [],
    "/console/v1/dynamic_configs": project.dynamicConfigs || [],
    "/console/v1/segments": project.segments || [],
    "/console/v1/metrics/list": project.metrics || [],
    "/console/v1/layers": project.layers || [],
    "/console/v1/holdouts": project.holdouts || [],
    "/console/v1/tags": project.tags || [],
    "/console/v1/audit_logs": project.auditLogs || [],
    "/console/v1/users": project.users || [],
  };
  return (req) => {
    if (overrides[req.path]) return overrides[req.path](req);
    if (req.method !== "GET") return { status: 405, body: { message: "only GET in tests" } };
    if (req.path === "/console/v1/settings/reviews") return { body: { message: "ok", data: project.reviewSettings || { is_config_review_required: true, is_metric_review_required: true } } };
    if (lists[req.path]) return { body: page(lists[req.path], req.query, { path: req.path }) };
    const checks = req.path.match(/^\/console\/v1\/gates\/([^/]+)\/checks$/);
    if (checks) return { body: { message: "ok", data: { has_production_checks_in_last_7_days: false } } };
    return { status: 404, body: { message: "not found" } };
  };
}
