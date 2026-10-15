# Changelog

## 0.2.1 (2026-10-16)

Plugin fixes from a review in Cowork. The command-line tool and the GitHub Action are unchanged.

* When some checks fail to run, the runner still writes the report and exits with 2. The skill now reads that report and lists the failed checks under "could not run" instead of stopping.
* With nothing connected, the skill first asks which feature flag tool the user has, since it only audits Statsig, and mentions that a snapshot saved by the command-line tool works too.
* The sample project's answers say its console links point to the fictional project and do not open.

## 0.2.0 (2026-10-15)

The Claude plugin now works on claude.ai and in Cowork as well as in Claude Code, and the plugin itself no longer touches the network or a key. The command line tool and the GitHub Action work as before.

* The plugin moved to `plugin/`, and the marketplace entry points there, so `claude plugin install statsig-audit@statsig-audit` still works. The repository root keeps only the marketplace manifest.
* The plugin reads a Statsig project only through a Statsig MCP connection the user adds (Statsig's MCP server at `https://api.statsig.com/v3/mcp`), with read tools. It can also audit a snapshot file, or a bundled fictional sample project with no Statsig account. It no longer runs the CLI, reads `STATSIG_CONSOLE_API_KEY` or calls the Console API.
* The skill runs a bundled offline copy of the audit engine through `plugin/skills/audit/scripts/run.mjs`. `scripts/build-plugin.mjs` generates the copy from `src/`, leaves out the HTTP client, the API reader and the CLI, and refuses any module that could reach the network or read the environment. `npm run check:generated` and CI fail when the copy is out of date.
* The plugin has the fields the Claude plugin directory lists: a display name, an icon, and links to its documentation, support and privacy policy. It has its own README, written for people who use Claude, and a copy of the license.
* New `PRIVACY.md`, which covers the plugin, the CLI and the Action.
* The CLI entry point moved from `bin/statsig-audit.js` to `cli/statsig-audit.js`, so the repository has no top-level `bin/` directory, which claude.ai and Cowork do not accept in a plugin. The `statsig-audit` command, its options and the Action's inputs are unchanged.
* `src/version.js` holds the version as a literal, so the engine copy works without `package.json`.

## 0.1.0 (2026-10-14)

First public release.

* A command line tool, `statsig-audit`, that reads a Statsig project through the Console API with GET requests only and runs 25 hygiene checks over gates, dynamic configs, experiments, segments, metrics, layers, holdouts, tags, the audit log and the review settings.
* A Markdown report grouped by severity and check, with a summary, an inventory and a hygiene score, and a JSON report with a documented schema (`docs/report.schema.json`).
* `--fail-on` exit codes for CI, a config file for thresholds, naming patterns, ignored findings and enabled checks, and offline audits of a saved snapshot with `--input`.
* The key is read only from `STATSIG_CONSOLE_API_KEY` and is removed from every output, including error messages that echo it.
* A composite GitHub Action that writes the report to a file, the job summary and step outputs.
* A Claude Code plugin with one skill, `/statsig-audit:audit`, that runs the audit from a key or from Statsig MCP read tools and writes an action plan with owners.
