# Privacy

statsig-audit is an unofficial, open-source project. It has no server of its own, no accounts, no analytics and no telemetry. This page covers the Claude plugin, the command line tool and the GitHub Action.

## The Claude plugin

* **No network calls.** The plugin's only code, the offline audit engine and its runner in `plugin/skills/audit/scripts/`, reads a snapshot file and writes a report file. It has no network code.
* **Reads Statsig only through your connection.** The plugin reads a Statsig project only through the Statsig MCP connection you add yourself, under your own Statsig sign-in, and only with read tools. That connection is between you and Statsig, and Statsig's own terms and privacy policy apply to it.
* **Stores nothing.** The snapshot and the report go to a private temporary folder where the engine runs, in Claude's code environment or, in Claude Code, on your computer. The folder is deleted when the audit is done. The plugin keeps no copy and never sees an API key.
* **What stays in the conversation.** The action plan names entities and owners. Email addresses are left out unless you ask for them. The conversation itself is handled under the terms of the Claude product you use.

## The command line tool and the GitHub Action

* **Sends GET requests only, and only to Statsig's Console API** (`https://statsigapi.net`), with the Console API key you provide in the `STATSIG_CONSOLE_API_KEY` environment variable. The key is never written to any output.
* **Writes only where you ask:** the report to stdout or the file you name, a snapshot only with `--save-snapshot`, and, in the Action, the job summary and step outputs. Reports and snapshots hold project data, such as entity names, rules and owners, so treat them as internal documents.
* **No telemetry.** Nothing is sent anywhere else.

[SECURITY.md](SECURITY.md) has the details on how the key and the data are handled.

## Contact

Ask a question at <https://github.com/ardaasaroglu/statsig-audit/issues>. For anything sensitive, use private vulnerability reporting at <https://github.com/ardaasaroglu/statsig-audit/security/advisories/new>. Please do not include API keys or real project data.
