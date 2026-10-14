// A read-only client for the Statsig Console API.
//
// It is GET-only by construction: request() throws before any network call for any
// other method. It also refuses paths the audit never needs and that could expose
// secrets or change a project (/keys and code_cleanup).

export const DEFAULT_BASE_URL = "https://statsigapi.net/console/v1";
export const API_VERSION = "20240601";
export const PAGE_LIMIT = 100;

const FORBIDDEN_PATHS = [
  { test: (p) => /^\/keys(\/|$)/.test(p), why: "it returns raw API keys" },
  { test: (p) => /code_cleanup/.test(p), why: "code cleanup is a write action" },
];

export class ApiError extends Error {
  constructor(message, { kind, status = null, path = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.path = path;
  }
}

/**
 * Only the real API host, or a loopback address for tests, may receive the key.
 * Returns the normalized base URL or throws.
 */
export function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Not a valid URL: ${value}`);
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  const official = url.protocol === "https:" && url.hostname === "statsigapi.net";
  if (!official && !(loopback && (url.protocol === "http:" || url.protocol === "https:"))) {
    throw new Error("The API base URL must be https://statsigapi.net or a loopback address used for tests.");
  }
  return url.href.replace(/\/+$/, "");
}

export function assertReadOnly(method, path) {
  if (String(method).toUpperCase() !== "GET") {
    throw new Error(`statsig-audit is read-only and only sends GET requests. Refused ${String(method).toUpperCase()} ${path}.`);
  }
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("..")) {
    throw new Error(`Refused request to an unexpected path: ${path}`);
  }
  for (const rule of FORBIDDEN_PATHS) {
    if (rule.test(path)) throw new Error(`statsig-audit never calls ${path}, because ${rule.why}.`);
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(header, nowMs) {
  if (!header) return null;
  const text = String(header).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
}

/**
 * @param {object} options
 * @param {string} options.apiKey Console API key. Only ever placed in the STATSIG-API-KEY header.
 */
export function createClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetch: fetchImpl = globalThis.fetch,
  minIntervalMs = 100, // at most 10 requests per second
  windowLimit = 850, // and at most 850 requests per 15 minutes
  windowMs = 15 * 60 * 1000,
  maxRetries = 4,
  retryBaseMs = 1000,
  retryMaxMs = 30000,
  timeoutMs = 30000,
  sleep = defaultSleep,
  now = Date.now,
  random = Math.random,
  log = () => {},
  userAgent = "statsig-audit",
} = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new Error("createClient needs an API key.");
  const base = validateBaseUrl(baseUrl);
  const starts = [];
  const stats = { requests: 0, retries: 0 };

  async function throttle() {
    const last = starts.length ? starts[starts.length - 1] : null;
    if (last !== null) {
      const wait = last + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
    }
    while (starts.length && starts[0] <= now() - windowMs) starts.shift();
    if (starts.length >= windowLimit) {
      const wait = starts[0] + windowMs - now();
      if (wait > 0) {
        log(`Pausing ${Math.ceil(wait / 1000)}s to stay under ${windowLimit} requests per 15 minutes.`);
        await sleep(wait);
      }
      starts.shift();
    }
    starts.push(now());
  }

  function backoffMs(attempt) {
    const ceiling = Math.min(retryMaxMs, retryBaseMs * 2 ** attempt);
    // Equal jitter: half fixed, half random, so retries never fire at once.
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
  }

  function buildUrl(path, query) {
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url;
  }

  async function request(method, path, query = {}) {
    assertReadOnly(method, path);
    const url = buildUrl(path, query);
    const shown = url.pathname.replace(/^.*?\/console\/v1/, "") + url.search;
    for (let attempt = 0; ; attempt++) {
      await throttle();
      stats.requests++;
      let response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "STATSIG-API-KEY": apiKey,
            "STATSIG-API-VERSION": API_VERSION,
            Accept: "application/json",
            "User-Agent": userAgent,
          },
        });
      } catch (error) {
        const cause = String(error?.cause?.code || error?.cause?.message || error?.message || "unknown error")
          .split(apiKey)
          .join("[redacted]")
          .replace(/[.\s]+$/, "");
        if (attempt < maxRetries) {
          const wait = backoffMs(attempt);
          stats.retries++;
          log(`GET ${shown}: network error (${cause}), retrying in ${wait} ms`);
          await sleep(wait);
          continue;
        }
        throw new ApiError(`Could not reach Statsig (GET ${shown}): ${cause}. Check the network and try again.`, { kind: "network", path: shown });
      }

      const status = response.status;
      if (status === 429 || status >= 500) {
        if (attempt < maxRetries) {
          const hinted = retryAfterMs(response.headers.get("retry-after"), now());
          const wait = hinted !== null ? Math.min(hinted, retryMaxMs * 2) : backoffMs(attempt);
          stats.retries++;
          log(`GET ${shown}: HTTP ${status}, retrying in ${wait} ms`);
          await drain(response);
          await sleep(wait);
          continue;
        }
        await drain(response);
        if (status === 429) {
          throw new ApiError(`Statsig kept answering 429 Too Many Requests on GET ${shown} after ${maxRetries} retries. Wait a few minutes and run again.`, { kind: "rate_limited", status, path: shown });
        }
        throw new ApiError(`Statsig answered HTTP ${status} on GET ${shown} after ${maxRetries} retries. Try again later.`, { kind: "server", status, path: shown });
      }

      if (status >= 300 && status < 400) {
        await drain(response);
        throw new ApiError(`Statsig answered with a redirect (HTTP ${status}) on GET ${shown}. Redirects are not followed, so the key is never sent to another address.`, { kind: "redirect", status, path: shown });
      }
      if (status === 401) {
        await drain(response);
        throw new ApiError(`Statsig rejected the Console API key (HTTP 401 on GET ${shown}). Check that STATSIG_CONSOLE_API_KEY holds an active Console API key for this project. A server or client SDK key does not work here.`, { kind: "auth", status, path: shown });
      }
      if (status === 403) {
        await drain(response);
        throw new ApiError(`The Console API key may not read GET ${shown} (HTTP 403). The key lacks the scope for this endpoint, or the project does not include it.`, { kind: "forbidden", status, path: shown });
      }
      if (status === 404) {
        await drain(response);
        throw new ApiError(`Statsig answered 404 Not Found on GET ${shown}.`, { kind: "not_found", status, path: shown });
      }
      if (status < 200 || status >= 300) {
        // A server message may echo the key. Remove it here as well as in the output layer.
        const snippet = (await safeText(response)).split(apiKey).join("[redacted]").slice(0, 200).replace(/\s+/g, " ");
        throw new ApiError(`Statsig answered HTTP ${status} on GET ${shown}${snippet ? `: ${snippet}` : "."}`, { kind: "http", status, path: shown });
      }

      const text = await safeText(response);
      try {
        return JSON.parse(text);
      } catch {
        throw new ApiError(`Statsig sent a response that is not JSON on GET ${shown}.`, { kind: "bad_response", status, path: shown });
      }
    }
  }

  const get = (path, query) => request("GET", path, query);

  /**
   * Reads every page of a list endpoint with page/limit=100. The next page number is
   * built here; the server's `nextPage` string is only used as a "there is more" signal,
   * because its format varies (scheme-less host, relative path or bare query).
   */
  async function getAll(path, query = {}, { maxPages = 500 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const body = await get(path, { ...query, page, limit: PAGE_LIMIT });
      const data = Array.isArray(body?.data) ? body.data : null;
      if (!data) throw new ApiError(`Unexpected response on GET ${path}: no data array.`, { kind: "bad_response", path });
      items.push(...data);
      const pagination = body.pagination && typeof body.pagination === "object" ? body.pagination : null;
      const more = pagination && "nextPage" in pagination
        ? pagination.nextPage !== null && pagination.nextPage !== undefined && pagination.nextPage !== ""
        : data.length >= PAGE_LIMIT;
      const total = typeof pagination?.totalItems === "number" ? pagination.totalItems : null;
      log(`GET ${path} page ${page}: ${data.length} items`);
      if (data.length === 0 || !more || (total !== null && items.length >= total)) return items;
    }
    throw new ApiError(`Stopped reading ${path} after ${maxPages} pages.`, { kind: "bad_response", path });
  }

  return { request, get, getAll, stats };
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function drain(response) {
  try {
    await response.arrayBuffer();
  } catch {
    // ignore
  }
}
