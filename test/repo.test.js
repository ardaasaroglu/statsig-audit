// Keeps the docs, manifests and workflows consistent with the code.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { renderCatalog } from "../src/checks/catalog.js";
import { CHECK_IDS } from "../src/checks/index.js";
import { HELP } from "../src/cli.js";
import { NAME, VERSION } from "../src/version.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const pkg = JSON.parse(read("package.json"));

function files(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else out.push(relative(ROOT, full).split("\\").join("/"));
  }
  return out;
}

describe("repository", () => {
  it("docs/checks.md is generated from the current check metadata (run npm run docs)", () => {
    assert.equal(read("docs/checks.md"), renderCatalog());
  });

  it("the README lists every check and every CLI option", () => {
    const readme = read("README.md");
    for (const id of CHECK_IDS) assert.match(readme, new RegExp(`\\| ${id} \\|`), id);
    for (const option of HELP.match(/--[a-z-]+/g)) assert.ok(readme.includes(option), option);
  });

  it("the version module and the plugin manifests match package.json", () => {
    assert.equal(NAME, pkg.name);
    assert.equal(VERSION, pkg.version);
    const plugin = JSON.parse(read("plugin/.claude-plugin/plugin.json"));
    const market = JSON.parse(read(".claude-plugin/marketplace.json"));
    assert.equal(plugin.name, pkg.name);
    assert.equal(plugin.version, pkg.version);
    assert.equal(plugin.license, pkg.license);
    assert.equal(market.name, pkg.name);
    assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [[pkg.name, "./plugin"]]);
  });

  it("plugin/ is the only Claude plugin, and the root keeps only the marketplace", () => {
    assert.deepEqual(readdirSync(join(ROOT, ".claude-plugin")), ["marketplace.json"]);
    assert.deepEqual(
      files().filter((f) => f.endsWith(".claude-plugin/plugin.json")),
      ["plugin/.claude-plugin/plugin.json"],
    );
    assert.ok(!existsSync(join(ROOT, "skills")), "skills belong in plugin/skills/");
    assert.ok(!existsSync(join(ROOT, "bin")), "the CLI lives in cli/, because claude.ai and Cowork refuse a plugin with a top-level bin/");
  });

  it("the changelog has an entry for the current version", () => {
    assert.match(read("CHANGELOG.md"), new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} \\(\\d{4}-\\d{2}-\\d{2}\\)$`, "m"));
  });

  it("the action passes inputs through the environment, never into the script text", () => {
    const action = read("action.yml");
    const run = action.slice(action.indexOf("      run: |"));
    assert.doesNotMatch(run, /\$\{\{/);
    assert.match(action, /using: composite/);
    assert.match(run, /"\$GITHUB_ACTION_PATH\/cli\/statsig-audit\.js"/);
  });

  it("workflows use least privilege and pinned major versions", () => {
    for (const file of [".github/workflows/ci.yml", "examples/workflows/weekly-audit.yml"]) {
      const text = read(file);
      assert.match(text, /^permissions:\n {2}contents: read$/m, file);
      for (const [, version] of text.matchAll(/uses: actions\/[a-z-]+@(\S+)/g)) assert.match(version, /^v\d+$/, file);
    }
  });

  it("no file uses an em dash or en dash", () => {
    const offenders = files()
      .filter((f) => !f.endsWith(".png"))
      .filter((f) => /[\u2013\u2014]/.test(read(f)));
    assert.deepEqual(offenders, []);
  });

  it("package.json declares no dependencies and the bin entry exists", () => {
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
    assert.equal(pkg.bin["statsig-audit"], "cli/statsig-audit.js");
    assert.deepEqual(pkg.files, ["cli/", "src/"]);
    assert.match(read("cli/statsig-audit.js"), /^#!\/usr\/bin\/env node\n/);
  });

  it(
    "the CLI script is executable in a checkout",
    { skip: process.platform === "win32" && "Windows does not keep the executable bit" },
    () => {
      assert.ok(statSync(join(ROOT, "cli/statsig-audit.js")).mode & 0o111, "run git update-index --chmod=+x cli/statsig-audit.js");
    },
  );
});
