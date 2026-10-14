// Renders the sample report from the fictional fixture, exactly as the CLI would with
// --input test/fixtures/snapshot.json --config examples/.statsig-audit.json.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECK_IDS } from "../../src/checks/index.js";
import { resolveConfig } from "../../src/config.js";
import { runAudit } from "../../src/engine.js";
import { parseInstant } from "../../src/lib/time.js";
import { renderJson } from "../../src/report/json.js";
import { renderMarkdown } from "../../src/report/markdown.js";
import { normalizeSnapshot } from "../../src/snapshot.js";

export function loadFixture(root) {
  return normalizeSnapshot(JSON.parse(readFileSync(join(root, "test/fixtures/snapshot.json"), "utf8")));
}

export function sampleConfig(root) {
  return resolveConfig(JSON.parse(readFileSync(join(root, "examples/.statsig-audit.json"), "utf8")), CHECK_IDS);
}

export function renderSample(root) {
  const snapshot = loadFixture(root);
  const config = sampleConfig(root);
  const result = runAudit(snapshot, config, { now: parseInstant(snapshot.fetchedAt) });
  return { result, markdown: renderMarkdown(result), json: renderJson(result) };
}
