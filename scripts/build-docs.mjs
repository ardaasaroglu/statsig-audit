// Builds docs/checks.md from the metadata in src/checks, so the catalog can never drift
// from the code. With --check it only compares and exits 1 on a difference.

import { readFileSync, writeFileSync } from "node:fs";
import { renderCatalog } from "../src/checks/catalog.js";

const target = new URL("../docs/checks.md", import.meta.url);
const content = renderCatalog();
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // missing counts as stale
  }
  if (current !== content) {
    console.error("docs/checks.md is out of date. Run npm run docs.");
    process.exitCode = 1;
  }
} else {
  writeFileSync(target, content);
  console.log("wrote docs/checks.md");
}
