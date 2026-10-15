# Security

statsig-audit runs with a key that can read a whole Statsig project. This page says what it does with that key and with the data it reads.

## The key

* **It comes from one place:** the `STATSIG_CONSOLE_API_KEY` environment variable. No option takes a key, so there is no reason to type one on a command line, where it would land in shell history and the process list. The CLI refuses `--key`, `--api-key`, `--token` and similar flags without echoing the value.
* **It goes to one place:** the `STATSIG-API-KEY` header of requests to `https://statsigapi.net`. Redirects are not followed, so the key is never sent to another host. The test-only override `STATSIG_AUDIT_API_BASE` accepts nothing but `https://statsigapi.net` and loopback addresses.
* **It never appears in output.** Everything the CLI writes passes through a redactor: stdout, stderr, the report, the job summary, the GitHub outputs file and a saved snapshot. Statsig's error messages are cleaned too, because some of them echo the key back. A key with a space, a line break or a non-ASCII character inside it is refused before any request, also without echoing it. A test runs the real CLI with a fake key against a local server, on success and on 401, 403, 429, 500, 400 and a dropped connection, and fails if the key shows up anywhere.
* **Use a read-only key.** Create a Console API key with a read-only scope (`omni_read_only` or `personal_read_only`) under Project Settings, Environments & Keys. The audit needs nothing more, and a read-only key limits the damage if it ever leaks.

## What it reads

* **GET only.** The HTTP client throws before any network call for any other method, and it refuses the `/keys` endpoint (which returns raw keys) and every `code_cleanup` endpoint. Both are covered by tests.
* **List calls by default:** gates (archived included), experiments, dynamic configs, segments, metrics, layers, holdouts, tags, 30 days of audit log and the review settings.
* **More only when asked:** the member list with `--users`, and one detail call per candidate gate or experiment with `--deep`.
* **Nothing else is contacted.** There is no telemetry.

## What it writes

* **The report**, to stdout or the file given with `--out`. It names entities, rules, owners and, in some findings, targeting values. Email addresses are masked unless you pass `--show-emails`.
* **A snapshot**, only with `--save-snapshot`. It holds project data: entity names, rules, targeting values, owner names and emails. A warning says so every time. Dynamic config values, rule return values and audit log change bodies are dropped before anything is written.
* Treat reports and snapshots as internal documents. In a public GitHub repository, job summaries and workflow artifacts are public too.

## The Claude plugin

* **It never handles a key.** The plugin in `plugin/` has no settings, never reads a key or any other value from `process.env`, and makes no network calls. Its only code is a runner, `run.mjs`, and an offline copy of the audit engine, which is generated from `src/` without the HTTP client, the API reader or the CLI. The build refuses to copy a module that calls `fetch`, imports a network module or reads the environment, and a test checks the plugin folder for the same.
* **It reads through your own Statsig connection.** The skill reads the project through the Statsig MCP connection the user adds, and tells the model to use read tools only, never a create, update, archive or cleanup tool. That is an instruction to a model, not a technical control. For a technical control, connect Statsig with a read-only role.
* **It cleans up.** The snapshot and report go to a private temporary directory, which the skill deletes when it is done. [PRIVACY.md](PRIVACY.md) has the details.

## Reporting a vulnerability

Report it privately at <https://github.com/ardaasaroglu/statsig-audit/security/advisories/new>. Please do not open a public issue for a security problem, and do not include a real key or real project data in the report.

That link works only while private vulnerability reporting is enabled in this repository's settings. If it shows an error, open an issue asking for a private contact, and leave out any details of the problem.
