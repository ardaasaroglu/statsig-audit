// Runs the real CLI in a child process with a clean environment. Only a short list of
// variables is passed through, so a Statsig key set on the developer's machine never
// reaches a test run.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const BIN = fileURLToPath(new URL("../../bin/statsig-audit.js", import.meta.url));
const PASS_THROUGH = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec"];

export function cleanEnv(extra = {}) {
  const env = {};
  for (const key of PASS_THROUGH) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, ...extra };
}

export function runCli(args, { env = {}, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: cleanEnv(env), cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
