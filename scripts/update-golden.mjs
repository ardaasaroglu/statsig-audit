// Regenerates examples/sample-report.md and examples/sample-report.json from the fictional
// fixture snapshot. The test suite compares them byte for byte, so the sample always matches
// what the code produces. With --check it only compares and exits 1 on a difference.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSample } from "../test/helpers/sample.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const check = process.argv.includes("--check");
const { markdown, json } = renderSample(root);
const targets = [
  ["examples/sample-report.md", markdown],
  ["examples/sample-report.json", json],
];

let stale = 0;
for (const [path, content] of targets) {
  let current = null;
  try {
    current = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    // missing file counts as stale
  }
  if (current === content) continue;
  if (check) {
    console.error(`${path} is out of date. Run npm run golden.`);
    stale++;
  } else {
    writeFileSync(new URL(`../${path}`, import.meta.url), content);
    console.log(`wrote ${path}`);
  }
}
process.exitCode = stale ? 1 : 0;
