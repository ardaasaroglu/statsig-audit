// Builds the generated files inside the Claude plugin's skill folder from their sources:
//
//   plugin/skills/audit/scripts/engine/      offline copy of the audit engine, from src/
//   plugin/skills/audit/references/          the check catalog and snapshot format, from docs/
//   plugin/skills/audit/assets/sample-snapshot.json   the fictional fixture, from test/fixtures/
//
// The skill folder has to be self-contained, because claude.ai copies only that folder into
// its code sandbox. The plugin makes no network calls, so only the modules an offline audit
// needs are copied: never the HTTP client, the API reader or the command line entry point.
// The build stops with an error when a copied module could reach the network or read the
// environment, or imports anything outside the copied set.
//
// Engine modules are copied with the .mjs extension, and their relative imports are rewritten
// to match, so Node loads them as ES modules without a package.json next to them.
//
// With --check it only compares and exits 1 when a generated file is missing, different or
// unexpected. Zero dependencies.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILL_DIR = "plugin/skills/audit";
const ENGINE_DIR = `${SKILL_DIR}/scripts/engine`;
const REPO_BLOB = "https://github.com/ardaasaroglu/statsig-audit/blob/main";
const EDIT_NOTE = "Edit the source, then run npm run build:plugin.";

// What the offline audit needs, relative to src/. A trailing slash copies every .js file in
// that folder.
const ENGINE_SOURCES = [
  "engine.js",
  "snapshot.js",
  "config.js",
  "version.js",
  "checks/",
  "report/",
  "lib/entities.js",
  "lib/redact.js",
  "lib/time.js",
];

// Modules that talk to the Console API or read the environment. Never copied.
const NEVER_COPIED = ["cli.js", "client.js", "fetch-snapshot.js"];

// Text that must not appear in a copied module.
const FORBIDDEN = [
  [/\bfetch\s*\(/, "a fetch( call"],
  [/statsigapi/i, "the Console API host"],
  [/process\.env/, "an environment variable read"],
  [/STATSIG_CONSOLE_API_KEY/, "the key variable name"],
];

// The only Node built-ins a copied module may import.
const ALLOWED_BUILTINS = new Set(["node:fs", "node:path", "node:url", "node:util"]);

const REFERENCES = [
  ["docs/snapshot-format.md", `${SKILL_DIR}/references/snapshot-format.md`],
  ["docs/checks.md", `${SKILL_DIR}/references/checks.md`],
];

const SAMPLE = ["test/fixtures/snapshot.json", `${SKILL_DIR}/assets/sample-snapshot.json`];

class BuildError extends Error {}

const read = (path) => readFileSync(join(ROOT, path), "utf8");

/** Every file under `dir` (a repository-relative path), as repository-relative paths. */
function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    const full = join(ROOT, rel);
    if (!existsSync(full)) return;
    for (const name of readdirSync(full).sort()) {
      const child = posix.join(rel, name);
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk(dir);
  return out;
}

/** The engine modules to copy, as paths relative to src/. */
function engineModules() {
  const modules = [];
  for (const entry of ENGINE_SOURCES) {
    if (entry.endsWith("/")) {
      const folder = entry.slice(0, -1);
      for (const file of listFiles(`src/${folder}`)) if (file.endsWith(".js")) modules.push(file.slice("src/".length));
    } else modules.push(entry);
  }
  for (const module of modules) {
    if (NEVER_COPIED.includes(module)) throw new BuildError(`src/${module} must never be copied into the plugin.`);
    if (!existsSync(join(ROOT, "src", module))) throw new BuildError(`src/${module} does not exist.`);
  }
  return modules.sort();
}

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g;

/** Checks one module's text and imports, and returns it with .js imports rewritten to .mjs. */
function copyModule(module, copied) {
  const source = `src/${module}`;
  const text = read(source);
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(text)) throw new BuildError(`${source} contains ${what}, so it cannot go into the offline plugin.`);
  }
  return text.replace(SPECIFIER, (match, lead, quote, specifier) => {
    if (specifier.startsWith("node:")) {
      if (!ALLOWED_BUILTINS.has(specifier)) throw new BuildError(`${source} imports ${specifier}. The plugin's engine may only import ${[...ALLOWED_BUILTINS].join(", ")}.`);
      return match;
    }
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      throw new BuildError(`${source} imports the package ${specifier}. The plugin's engine has no dependencies.`);
    }
    const target = posix.normalize(posix.join(posix.dirname(module), specifier));
    if (!copied.has(target)) throw new BuildError(`${source} imports src/${target}, which is not part of the offline engine.`);
    return `${lead}${quote}${specifier.replace(/\.js$/, ".mjs")}${quote}`;
  });
}

/** Relative links would break in the copy, so they point at the repository on GitHub. */
function absoluteLinks(markdown, source) {
  return markdown.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (match, target) => {
    const [path, anchor] = target.split("#");
    const resolved = posix.normalize(posix.join(posix.dirname(source), path));
    return `](${REPO_BLOB}/${resolved}${anchor ? `#${anchor}` : ""})`;
  });
}

/** Map of repository-relative output path to content. */
function buildPluginFiles() {
  const outputs = new Map();

  const modules = engineModules();
  const copied = new Set(modules);
  for (const module of modules) {
    const out = `${ENGINE_DIR}/${module.replace(/\.js$/, ".mjs")}`;
    const header = `// Generated from src/${module} by scripts/build-plugin.mjs. ${EDIT_NOTE}\n`;
    outputs.set(out, header + copyModule(module, copied));
  }

  for (const [source, out] of REFERENCES) {
    const header = `<!-- Generated from ${source} by scripts/build-plugin.mjs. ${EDIT_NOTE} -->\n\n`;
    outputs.set(out, header + absoluteLinks(read(source), source));
  }

  // JSON has no comments, so the note is a "$comment" field, which the snapshot loader ignores.
  const [source, out] = SAMPLE;
  const sample = {
    $comment: `A fictional sample project for trying the audit. Generated from ${source} by scripts/build-plugin.mjs. ${EDIT_NOTE}`,
    ...JSON.parse(read(source)),
  };
  outputs.set(out, `${JSON.stringify(sample, null, 2)}\n`);

  return outputs;
}

function main() {
  const check = process.argv.includes("--check");
  let outputs;
  try {
    outputs = buildPluginFiles();
  } catch (error) {
    if (error instanceof BuildError) {
      console.error(`build-plugin: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const changed = [];
  for (const [path, content] of outputs) {
    const full = join(ROOT, path);
    const current = existsSync(full) ? readFileSync(full, "utf8") : null;
    if (current !== content) changed.push(path);
  }
  const unexpected = listFiles(ENGINE_DIR).filter((path) => !outputs.has(path));

  if (check) {
    for (const path of changed) console.error(`${path} is out of date.`);
    for (const path of unexpected) console.error(`${path} is not made by the build and should not be there.`);
    if (changed.length || unexpected.length) {
      console.error("Run npm run build:plugin and commit the result.");
      process.exitCode = 1;
    }
    return;
  }

  // The engine folder belongs to the build, so a module removed from src/ goes away too.
  rmSync(join(ROOT, ENGINE_DIR), { recursive: true, force: true });
  for (const [path, content] of outputs) {
    const full = join(ROOT, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  for (const path of changed) console.log(`wrote ${path}`);
  for (const path of unexpected) console.log(`removed ${path}`);
  if (!changed.length && !unexpected.length) console.log("The plugin's generated files are up to date.");
}

main();
