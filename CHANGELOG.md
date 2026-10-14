# Changelog

## 0.1.0 (2026-10-14)

First public release.

* A command line tool, `statsig-audit`, that reads a Statsig project through the Console API with GET requests only and runs 25 hygiene checks over gates, dynamic configs, experiments, segments, metrics, layers, holdouts, tags, the audit log and the review settings.
* A Markdown report grouped by severity and check, with a summary, an inventory and a hygiene score, and a JSON report with a documented schema (`docs/report.schema.json`).
* `--fail-on` exit codes for CI, a config file for thresholds, naming patterns, ignored findings and enabled checks, and offline audits of a saved snapshot with `--input`.
* The key is read only from `STATSIG_CONSOLE_API_KEY` and is removed from every output, including error messages that echo it.
* A composite GitHub Action that writes the report to a file, the job summary and step outputs.
* A Claude Code plugin with one skill, `/statsig-audit:audit`, that runs the audit from a key or from Statsig MCP read tools and writes an action plan with owners.
