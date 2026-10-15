// The Claude plugin in plugin/ has to install on claude.ai, in Cowork and in Claude Code, meet
// the plugin directory's file rules, and stay offline: no network code, no environment reads
// and no key. Its runner has to give the same report as the CLI for the same snapshot.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { cleanEnv, runCli } from "./helpers/run-cli.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN = join(ROOT, "plugin");
const SKILL = join(PLUGIN, "skills", "audit");
const RUNNER = join(SKILL, "scripts", "run.mjs");
const SAMPLE = join(SKILL, "assets", "sample-snapshot.json");
const SAMPLE_CONFIG = join(ROOT, "examples", ".statsig-audit.json");
const FIXTURE = join(ROOT, "test", "fixtures", "snapshot.json");
const read = (path) => readFileSync(path, "utf8");
const pkg = JSON.parse(read(join(ROOT, "package.json")));

const KIB = 1024;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const ALLOWED_EXTENSIONS = new Set(["", ".md", ".json", ".mjs", ".js", ".txt", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** Every entry under `dir`, with its path relative to the plugin folder. Symbolic links are reported, not followed. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const stat = lstatSync(full);
    const rel = relative(PLUGIN, full).split("\\").join("/");
    if (stat.isSymbolicLink()) out.push({ full, rel, name, stat, link: true });
    else if (stat.isDirectory()) {
      out.push({ full, rel, name, stat, dir: true });
      walk(full, out);
    } else out.push({ full, rel, name, stat });
  }
  return out;
}

const entries = walk(PLUGIN);
const pluginFiles = entries.filter((e) => !e.dir && !e.link);
const textFiles = pluginFiles.filter((e) => !IMAGE.test(e.name));

/** Runs a script with node in a clean environment: a Statsig key on this machine never reaches it. */
function runNode(script, args, { cwd = ROOT } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env: cleanEnv(), cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

/** Import specifiers in a module: static imports, re-exports and dynamic imports. */
function specifiers(text) {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g)].map((m) => m[2]);
}

function pngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} is not a PNG`);
  assert.equal(bytes.subarray(12, 16).toString("latin1"), "IHDR");
  assert.equal(bytes.subarray(bytes.length - 8, bytes.length - 4).toString("latin1"), "IEND", `${path} is not a complete PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

describe("plugin folder", () => {
  it("has no top-level bin/ directory, which stops claude.ai and Cowork from installing a plugin", () => {
    assert.ok(!existsSync(join(PLUGIN, "bin")));
  });

  it("has a manifest with the directory listing fields, https links, an existing icon, and no settings or bundled server", () => {
    const manifest = JSON.parse(read(join(PLUGIN, ".claude-plugin", "plugin.json")));
    assert.equal(manifest.name, "statsig-audit");
    assert.match(manifest.displayName, /unofficial/i);
    assert.match(manifest.description, /^Unofficial, read-only /);
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.license, "MIT");
    assert.equal(manifest.author.name, "Arda Asaroglu");
    for (const field of ["homepage", "repository", "documentationUrl", "supportUrl", "privacyPolicyUrl"]) {
      assert.match(manifest[field], /^https:\/\/\S+$/, field);
    }
    assert.match(manifest.author.url, /^https:\/\//);
    // The documentation and privacy links point at files in this repository.
    const blob = "https://github.com/ardaasaroglu/statsig-audit/blob/main/";
    for (const field of ["documentationUrl", "privacyPolicyUrl"]) {
      assert.ok(manifest[field].startsWith(blob), field);
      assert.ok(existsSync(join(ROOT, manifest[field].slice(blob.length))), `${field} points at a missing file`);
    }
    assert.equal(manifest.supportUrl, "https://github.com/ardaasaroglu/statsig-audit/issues");

    assert.equal(manifest.icon, "./assets/icon.png");
    const icon = pngSize(join(PLUGIN, manifest.icon));
    assert.deepEqual([icon.width, icon.height], [512, 512]);
    assert.ok(icon.bytes < 64 * KIB, `the icon is ${icon.bytes} bytes`);

    for (const key of ["userConfig", "mcpServers", "hooks", "lspServers"]) assert.equal(manifest[key], undefined, key);
    assert.ok(!existsSync(join(PLUGIN, ".mcp.json")), "the plugin must not bundle an MCP server");
  });

  it("follows the directory's file rules: sizes, types, no links, no system files, no lockfile install", () => {
    assert.ok(pluginFiles.length <= 512, `${pluginFiles.length} files`);
    assert.deepEqual(entries.filter((e) => e.link).map((e) => e.rel), [], "symbolic links");
    for (const e of pluginFiles) {
      const dot = e.name.lastIndexOf(".");
      const ext = dot > 0 ? e.name.slice(dot).toLowerCase() : "";
      assert.ok(ALLOWED_EXTENSIONS.has(ext), `${e.rel} has a file type the directory holds for review`);
      if (!IMAGE.test(e.name)) assert.ok(e.stat.size < 256 * KIB, `${e.rel} is ${e.stat.size} bytes`);
    }
    const systemFiles = entries.filter((e) => [".ds_store", "thumbs.db", "desktop.ini", "__macosx"].includes(e.name.toLowerCase()));
    assert.deepEqual(systemFiles.map((e) => e.rel), []);
    const lower = new Map();
    for (const e of entries) {
      assert.doesNotMatch(e.name, /[:<>"|?*]|[. ]$/, `${e.rel} is not a valid Windows file name`);
      const key = e.rel.toLowerCase();
      assert.ok(!lower.has(key), `${e.rel} and ${lower.get(key)} differ only by case`);
      lower.set(key, e.rel);
    }
    const lockfiles = ["package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb"];
    assert.ok(!(existsSync(join(PLUGIN, "package.json")) && lockfiles.some((f) => existsSync(join(PLUGIN, f)))));
    for (const e of textFiles) assert.ok(!read(e.full).includes("\uFFFD"), `${e.rel} is not UTF-8 text`);
  });

  it("contains no network code, no environment reads and no key handling", () => {
    const offenders = [];
    for (const e of textFiles) {
      const text = read(e.full);
      for (const needle of ["fetch(", "STATSIG_CONSOLE_API_KEY", "process.env"]) if (text.includes(needle)) offenders.push(`${e.rel}: ${needle}`);
      if (/statsigapi/i.test(text)) offenders.push(`${e.rel}: statsigapi`);
    }
    assert.deepEqual(offenders, []);
  });

  it("runs only code that imports itself and a few Node built-ins", () => {
    const scripts = pluginFiles.filter((e) => /\.(mjs|js)$/.test(e.name));
    assert.ok(scripts.some((e) => e.rel === "skills/audit/scripts/run.mjs"));
    for (const e of scripts) {
      assert.ok(e.rel.startsWith("skills/audit/scripts/"), `${e.rel} is a script outside the skill's scripts folder`);
      for (const spec of specifiers(read(e.full))) {
        if (spec.startsWith("node:")) {
          assert.ok(["node:fs", "node:path", "node:url", "node:util"].includes(spec), `${e.rel} imports ${spec}`);
        } else {
          assert.match(spec, /^\.\.?\//, `${e.rel} imports the package ${spec}`);
          const target = resolve(dirname(e.full), spec);
          assert.ok(existsSync(target), `${e.rel} imports ${spec}, which does not exist`);
          assert.ok(!relative(join(SKILL, "scripts"), target).startsWith(".."), `${e.rel} imports ${spec} from outside the skill`);
        }
      }
    }
  });

  it("has engine copies, references and a sample that match their sources (npm run build:plugin)", async () => {
    const r = await runNode(join(ROOT, "scripts", "build-plugin.mjs"), ["--check"]);
    assert.equal(r.code, 0, r.stderr);
    const engine = pluginFiles.filter((e) => e.rel.startsWith("skills/audit/scripts/engine/")).map((e) => e.rel);
    for (const never of ["cli.mjs", "client.mjs", "fetch-snapshot.mjs"]) assert.ok(!engine.some((f) => f.endsWith(`/engine/${never}`)), never);
    for (const rel of engine) {
      assert.match(read(join(PLUGIN, rel)), /^\/\/ Generated from src\/\S+\.js by scripts\/build-plugin\.mjs\./, rel);
    }
  });

  it("has a copy of the root license", () => {
    assert.equal(read(join(PLUGIN, "LICENSE")), read(join(ROOT, "LICENSE")));
  });

  it("bundles a small sample snapshot with fictional data only", () => {
    const text = read(SAMPLE);
    assert.ok(Buffer.byteLength(text) < 256 * KIB);
    const sample = JSON.parse(text);
    assert.match(sample.$comment, /fictional/);
    assert.match(sample.project.name, /\(fictional\)$/);
    const domains = new Set([...text.matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase()));
    assert.deepEqual([...domains].sort(), ["acme-pantry.example", "acme-pantry.exmple"]);
  });

  it("keeps attributes that rewrite files out of .gitattributes, so directory validation can read the repository", () => {
    assert.doesNotMatch(read(join(ROOT, ".gitattributes")), /export-ignore|export-subst|\bfilter=/);
  });
});

describe("plugin skill", () => {
  const skill = read(join(SKILL, "SKILL.md"));
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);

  it("has only a name and a description, and the description says unofficial, read-only and when to use it", () => {
    assert.ok(frontmatter, "SKILL.md starts with frontmatter");
    const keys = frontmatter[1].split("\n").map((line) => line.split(":")[0]);
    assert.deepEqual(keys, ["name", "description"]);
    assert.match(frontmatter[1], /^name: audit$/m);
    const description = frontmatter[1].match(/^description: (.+)$/m)[1];
    assert.ok(description.length <= 1024, `${description.length} characters`);
    assert.doesNotMatch(description, /: |\s#/, "a plain YAML value");
    assert.match(description, /^Unofficial, read-only /);
    assert.match(description, /Use when /);
  });

  it("allows only read tools, and never asks for or handles a key", () => {
    for (const forbidden of ["api_write", "api_destructive", "Start_Gate_Code_Cleanup", "Start_Experiment_Code_Cleanup", "Invoke_Tool"]) {
      assert.ok(skill.includes(forbidden), forbidden);
    }
    assert.match(skill, /Never ask for, accept, read, print or store an API key/);
    assert.match(skill, /Page with a limit of 100/);
    assert.ok(!skill.includes("$ARGUMENTS"), "chat shows $ARGUMENTS literally");
    assert.ok(!skill.includes("CLAUDE_PLUGIN_ROOT"), "chat copies only the skill folder, so paths use CLAUDE_SKILL_DIR");
  });

  it("explains how to connect Statsig's MCP server and offers the sample", () => {
    assert.ok(skill.includes("https://api.statsig.com/v3/mcp"));
    assert.ok(skill.includes("claude mcp add --transport http statsig https://api.statsig.com/v3/mcp"));
    assert.ok(skill.includes("https://docs.statsig.com/integrations/mcp/overview"));
    assert.ok(skill.includes("fictional sample project"));
    assert.ok(skill.includes('"manual pass, results may differ from the engine"'));
  });

  it("runs only the bundled runner, and every file it names exists in the skill folder", () => {
    assert.match(skill, /node "\$\{CLAUDE_SKILL_DIR\}\/scripts\/run\.mjs" --input /);
    const named = new Set([
      ...[...skill.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w./-]+)/g)].map((m) => m[1]),
      ...[...skill.matchAll(/`((?:scripts|references|assets)\/[\w./-]+)`/g)].map((m) => m[1]),
    ]);
    assert.ok(named.size >= 4);
    for (const path of named) assert.ok(existsSync(join(SKILL, path)), path);
  });
});

describe("plugin runner", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "statsig-audit-plugin-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("audits the bundled sample offline, and the Markdown matches examples/sample-report.md", async () => {
    const r = await runNode(RUNNER, ["--input", SAMPLE, "--config", SAMPLE_CONFIG, "--format", "markdown", "--now", "2026-10-14T09:00:00Z"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, read(join(ROOT, "examples", "sample-report.md")));
    assert.match(r.stderr, /^statsig-audit: \d+ findings/);
  });

  it("writes the same JSON report as the CLI for the same snapshot", async () => {
    const out = join(dir, "report.json");
    const plugin = await runNode(RUNNER, ["--input", SAMPLE, "--config", SAMPLE_CONFIG, "--out", out]);
    assert.equal(plugin.code, 0, plugin.stderr);
    assert.match(plugin.stderr, /Report written to/);
    const cli = await runCli(["--input", FIXTURE, "--config", SAMPLE_CONFIG, "--format", "json"]);
    assert.equal(cli.code, 0, cli.stderr);
    assert.equal(read(out), cli.stdout);
    assert.equal(read(out), read(join(ROOT, "examples", "sample-report.json")));
  });

  it("works from a copy of the skill folder alone, as in claude.ai's code sandbox", async () => {
    const copy = join(dir, "audit");
    cpSync(SKILL, copy, { recursive: true });
    const inRepo = await runNode(RUNNER, ["--input", SAMPLE]);
    const alone = await runNode(join(copy, "scripts", "run.mjs"), ["--input", "audit/assets/sample-snapshot.json"], { cwd: dir });
    assert.equal(alone.code, 0, alone.stderr);
    assert.equal(alone.stdout, inRepo.stdout);
    assert.equal(JSON.parse(alone.stdout).tool.version, pkg.version);
  });

  it("refuses to run without --input", async () => {
    const r = await runNode(RUNNER, []);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--input is required/);
    assert.equal(r.stdout, "");
  });

  it("exits 2 for usage and snapshot problems, like the CLI, without echoing stray arguments", async () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ gates: "nope" }));
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{");
    const cases = [
      [["--input", SAMPLE, "--bogus"], /Unknown option '--bogus'/],
      [["--input", SAMPLE, "console-PASTED-by-mistake-123"], /Unexpected argument\. run\.mjs takes only/],
      [["--input", SAMPLE, "--format", "xml"], /--format must be json or markdown/],
      [["--input", SAMPLE, "--checks", "G01,Z99"], /Unknown check id: Z99/],
      [["--input", SAMPLE, "--now", "yesterday"], /--now must be an ISO 8601/],
      [["--input", SAMPLE, "--config", join(dir, "missing.json")], /Cannot read the config file/],
      [["--input", join(dir, "missing.json")], /Cannot read the snapshot/],
      [["--input", broken], /is not valid JSON/],
      [["--input", bad], /fetchedAt must be an ISO 8601[\s\S]*gates must be an array or null/],
    ];
    for (const [args, message] of cases) {
      const r = await runNode(RUNNER, args);
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, message);
      assert.ok(!r.stderr.includes("PASTED"), "a stray argument was echoed");
    }
  });

  it("runs only the checks asked for", async () => {
    const r = await runNode(RUNNER, ["--input", SAMPLE, "--checks", "g01,E03"]);
    assert.equal(r.code, 0, r.stderr);
    const ran = JSON.parse(r.stdout).checks.filter((c) => c.status === "ran").map((c) => c.id);
    assert.deepEqual(ran, ["G01", "E03"]);
  });
});

describe("plugin README", () => {
  const readme = read(join(PLUGIN, "README.md"));
  const prose = readme.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");

  it("starts with the unofficial notice", () => {
    assert.equal(
      readme.split("\n")[0],
      "Unofficial. Not affiliated with, endorsed by, or sponsored by Statsig or its owners. Statsig is a trademark of its respective owner.",
    );
  });

  it("has at least 40 words outside code blocks", () => {
    const words = prose.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    assert.ok(words.length >= 40, `${words.length} words`);
  });

  it("has at least four example prompts, one of them for the bundled sample", () => {
    const section = readme.split(/^## Example prompts$/m)[1].split(/^## /m)[0];
    const prompts = [...section.matchAll(/^\* "([^"]+)"/gm)].map((m) => m[1]);
    assert.ok(prompts.length >= 4, `${prompts.length} prompts`);
    assert.ok(prompts.some((p) => /sample project/.test(p)));
  });

  it("says what the plugin reads and sends, and links privacy, support and the license", () => {
    assert.ok(
      readme.includes(
        "Reads your project only through your own Statsig connection, with read tools. The audit engine runs inside Claude's code environment on a temporary snapshot that is deleted afterwards. The plugin itself makes no network calls, stores nothing, and never sees an API key.",
      ),
    );
    for (const heading of ["## What it finds", "## How to use it", "## Example prompts", "## What it reads and sends", "## Requirements", "## Troubleshooting", "## Privacy", "## Support", "## License"]) {
      assert.ok(readme.includes(`\n${heading}\n`), heading);
    }
    assert.ok(readme.includes("https://github.com/ardaasaroglu/statsig-audit/blob/main/PRIVACY.md"));
    assert.ok(readme.includes("https://github.com/ardaasaroglu/statsig-audit/issues"));
  });

  it("shows images only with Markdown image syntax, and names no bundled image anywhere else", () => {
    assert.doesNotMatch(readme, /<img\b/i);
    for (const [, target] of readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (!/^https?:/.test(target)) assert.ok(existsSync(join(PLUGIN, target)), target);
    }
    const mentions = textFiles.filter((e) => e.rel !== ".claude-plugin/plugin.json" && /icon\.png/.test(read(e.full)));
    assert.deepEqual(mentions.map((e) => e.rel), []);
  });
});
