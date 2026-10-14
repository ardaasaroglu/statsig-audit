---
name: audit
description: Read-only hygiene audit of a Statsig project. Finds stale gates, forgotten rollouts, broken targeting, experiments past their plan and untrusted metrics, then writes a prioritized action plan with owners. Use when the user asks to audit, clean up or health-check their Statsig gates, experiments, dynamic configs, segments or metrics.
argument-hint: "[statsig-audit options, for example --deep or --checks G01,E03]"
---

# Statsig hygiene audit

Run a read-only audit of the user's Statsig project with the statsig-audit CLI that ships in this plugin, then turn its JSON report into an action plan. Nothing in this skill changes the project.

## Rules that always apply

1. **Read only.** Never create, update, delete, archive, launch, disable, approve or clean up anything in Statsig, even if the user asks for it in the same request. Offer to list the changes so they can make them in the console.
2. **Never expose the key.** Do not print, echo, log or write the value of `STATSIG_CONSOLE_API_KEY`. Do not run `env`, `printenv`, `set`, `export -p`, `Get-ChildItem env:` or anything else that lists environment variables. Never put a key on a command line, and never ask the user to paste a key into the chat.
3. **No email addresses** in your answer unless the user asks for them. Use owner names.
4. **Clean up.** Delete every temporary file and directory this skill creates before you finish, also when a step fails. Never write a snapshot or report inside the user's repository unless they ask for it.
5. **Arguments.** Pass on only statsig-audit options from the user's arguments: `--deep`, `--users`, `--checks <ids>`, `--audit-log-days <n>`, `--config <file>`, `--now <date>`. Ignore anything else.

## Step 1: pick the data source

Check whether the key is set, without showing it:

```bash
node -e "process.exit(process.env.STATSIG_CONSOLE_API_KEY ? 0 : 1)"
```

* Exit code 0: use **Path A**.
* Otherwise, if a Statsig MCP server is connected (tools such as `gate_read` or `Get_List_of_Gates`): use **Path B**.
* Otherwise: use **Path C**.

## Path A: the Console API key

1. Create a private temporary directory and note the path it prints:

   ```bash
   node -e "const fs=require('fs'),os=require('os'),p=require('path');console.log(fs.mkdtempSync(p.join(os.tmpdir(),'statsig-audit-')))"
   ```

2. Run the audit. It only sends GET requests:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/statsig-audit.js" --format json --out "<dir>/report.json" <options>
   ```

   * Exit code 0: the report is written.
   * Exit code 2: a usage or config problem. Show the message and stop.
   * Exit code 3: Statsig could not be read. Show the message (it never contains the key). Suggest checking that the key is a Console API key for this project with a read scope. Stop.

3. Read `<dir>/report.json`, then delete `<dir>`.

## Path B: Statsig MCP read tools

Use only these tools:

* **MCP v3:** `get_context`, `search`, `fetch`, `discover_tools`, `gate_read`, `experiment_read`, `dynamic_config_read`, `metric_read`, `layer_read`, `segment_read`, and `api_read` for list and get actions only. If a call reports a lane other than `api_read`, do not use it.
* **MCP v1:** tools whose names start with `Get_`, such as `Get_List_of_Gates`, `Get_List_of_Experiments`, `Get_List_of_Dynamic_Configs`, `Get_List_of_Segments`, `Get_List_of_Metrics`, `Get_List_of_Layers`, `Get_List_of_Tags` and `Get_Audit_Logs`, plus `search` and `fetch`.

Never call a tool or action whose name contains `create`, `update`, `delete`, `archive`, `approve`, `commit`, `reject`, `cancel`, `edit`, `start`, `restart`, `cleanup` or `invoke`, and never use the `api_write` or `api_destructive` lanes. That includes `Start_Gate_Code_Cleanup`, `Start_Experiment_Code_Cleanup` and `Invoke_Tool`.

1. Read the lists: gates, experiments, dynamic configs, segments, metrics, layers, tags, and the audit log for the last 30 days. Page with a limit of 100 until a page returns fewer than 100 items. Keep the items exactly as the tools return them. Do not invent or fill in fields.
2. Create a temporary directory as in Path A, and write `<dir>/snapshot.json` in the format described in `${CLAUDE_PLUGIN_ROOT}/docs/snapshot-format.md`:
   * `"schemaVersion": 1`, `"fetchedAt"`: the current time in ISO 8601 UTC, `"source": "mcp"`.
   * `"collected": { "auditLogDays": 30, "includesArchivedGates": false }`, because the MCP list tools do not return archived gates.
   * The items under `gates`, `experiments`, `dynamicConfigs`, `segments`, `metrics`, `layers`, `holdouts`, `tags` and `auditLogs`.
   * `null` for any list you could not read, with the reason under `"unavailable"`, for example `{ "holdouts": "no MCP read tool" }`. Set `users` and `reviewSettings` to `null` unless you read them.
3. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/statsig-audit.js" --input "<dir>/snapshot.json" --format json --out "<dir>/report.json" <options>
   ```

   Exit code 2 means the snapshot does not match the format. Fix it from the message and run again.
4. Read `<dir>/report.json`, then delete `<dir>`, snapshot included.

## Path C: nothing connected

Explain the two ways to connect, briefly, and stop:

* Create a read-only Console API key in the Statsig console under Project Settings, Environments & Keys. Set it as `STATSIG_CONSOLE_API_KEY` in the environment Claude Code starts from, then run this skill again.
* Or connect Statsig's MCP server and run this skill again.

## Step 2: write the action plan

Base everything on the report. Use its messages, actions, owners and permalinks. Never add findings or entities it does not contain.

1. **Headline.** Findings by severity, the hygiene score, and the checks that could not run with the reason (for example, G14 needs `--users`).
2. **This week** (high). One line per finding: the entity id linked to its permalink, what is wrong, what to do, and the owner.
3. **This quarter** (medium). Grouped by owner, then by check, one line per finding.
4. **Hygiene** (low). Grouped by check with counts. List up to 10 entity ids per check, then "and N more".
5. **Next steps.** Offer to run again with `--deep` or `--users` if those checks were skipped, or to suggest thresholds and an ignore list for `.statsig-audit.json`.

Use "no owner" when the owner is empty. Keep the plan under 60 lines unless the user asks for everything.
