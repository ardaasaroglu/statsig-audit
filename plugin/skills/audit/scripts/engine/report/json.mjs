// Generated from src/report/json.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
import { prepareResult } from "./prepare.mjs";

/** The JSON report. Its shape is documented in docs/report-schema.md and docs/report.schema.json. */
export function renderJson(result, options = {}) {
  return `${JSON.stringify(prepareResult(result, options), null, 2)}\n`;
}
