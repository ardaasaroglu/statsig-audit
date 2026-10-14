#!/usr/bin/env node
// statsig-audit: a read-only hygiene audit for a Statsig project. Unofficial.
// This file stays free of newer syntax so an old Node prints a clear message.

var major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  process.stderr.write("statsig-audit needs Node.js 20 or newer. This is Node.js " + process.versions.node + ".\n");
  process.exit(2);
}

import("../src/cli.js").then(
  function (cli) {
    return cli.main(process.argv.slice(2)).then(function (code) {
      process.exitCode = code;
    });
  },
  function (error) {
    process.stderr.write("statsig-audit: could not start: " + (error && error.message ? error.message : error) + "\n");
    process.exitCode = 2;
  }
);
