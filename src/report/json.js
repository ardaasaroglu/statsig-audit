import { prepareResult } from "./prepare.js";

/** The JSON report. Its shape is documented in docs/report-schema.md and docs/report.schema.json. */
export function renderJson(result, options = {}) {
  return `${JSON.stringify(prepareResult(result, options), null, 2)}\n`;
}
