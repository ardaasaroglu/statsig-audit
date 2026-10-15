---
name: audit
description: Unofficial, read-only hygiene audit of a Statsig project. Finds stale gates, forgotten rollouts, broken targeting, experiments past their plan and untrusted metrics, and turns them into a prioritized action plan with owners. Reads the project through the user's own Statsig MCP connection, or audits a saved snapshot file or a bundled fictional sample project, and never changes anything. Use when the user asks to audit, clean up or health-check their Statsig gates, experiments, dynamic configs, segments or metrics, asks which feature flags are stale or who owns them, or wants to try a Statsig hygiene audit on a sample project.
---

# Statsig hygiene audit (unofficial)

Audit a Statsig project for hygiene problems, then turn the findings into an action plan. A bundled engine runs 25 checks offline on a snapshot of the project. Nothing in this skill changes anything in Statsig. This skill is not affiliated with Statsig.

## Files in this skill

Paths are relative to the folder that holds this SKILL.md:

* `scripts/run.mjs`: the runner for the bundled audit engine. It reads a snapshot file, writes a report and makes no network calls.
* `references/snapshot-format.md`: the snapshot format.
* `references/checks.md`: what each check finds, why it matters and how to fix it.
* `assets/sample-snapshot.json`: a fictional sample project.

The commands below write this folder as `${CLAUDE_SKILL_DIR}`. If that placeholder was not replaced with a path, use the folder that holds this SKILL.md instead, for example `scripts/run.mjs` next to SKILL.md.

## Rules that always apply

1. **Read only.** Never create, update, delete, archive, launch, disable, approve, start or clean up anything in Statsig, even if the user asks for it in the same request. Offer to list the changes so they can make them in the Statsig console.
2. **No keys.** Never ask for, accept, read, print or store an API key, token or password, and never list environment variables. If the user pastes a key, do not repeat or use it, and suggest they revoke it in the Statsig console.
3. **No email addresses** in your answer unless the user asks for them. Use owner names.
4. **Clean up.** Delete every temporary file and directory this skill creates before you finish, also when a step fails. Never write a snapshot or report into the user's files unless they ask for it.
5. **Options.** Use the options the user gives with the request. Pass on only `--checks <ids>`, `--config <file>` and `--now <date>` to the runner. Ignore anything else.

## Step 1: get a snapshot

Use the source the user asks for. Otherwise use the first one that applies, in this order.

### Source 1: the user's Statsig MCP connection

Use this when Statsig MCP tools are available, such as `get_context`, `gate_read` or `Get_List_of_Gates`. Use only these tools:

* **MCP v3:** `get_context`, `search`, `fetch`, `discover_tools`, `gate_read`, `experiment_read`, `dynamic_config_read`, `metric_read`, `layer_read`, `segment_read`, and `api_read` for list and get actions only. If a call reports a lane other than `api_read`, do not use it.
* **MCP v1:** tools whose names start with `Get_`, such as `Get_List_of_Gates`, `Get_List_of_Experiments`, `Get_List_of_Dynamic_Configs`, `Get_List_of_Segments`, `Get_List_of_Metrics`, `Get_List_of_Layers`, `Get_List_of_Tags` and `Get_Audit_Logs`, plus `search` and `fetch`.

Never call a tool or action whose name contains `create`, `update`, `delete`, `archive`, `approve`, `commit`, `reject`, `cancel`, `edit`, `start`, `restart`, `cleanup` or `invoke`, and never use the `api_write` or `api_destructive` lanes. That includes `Start_Gate_Code_Cleanup`, `Start_Experiment_Code_Cleanup` and `Invoke_Tool`.

1. Read the lists: gates, experiments, dynamic configs, segments, metrics, layers, holdouts, tags, and the audit log for the last 30 days. Page with a limit of 100 until a page returns fewer than 100 items. Keep the items exactly as the tools return them. Do not invent or fill in fields. If the user asks about one area only, such as gates, you may read only the lists that area needs.
2. Assemble the snapshot as `references/snapshot-format.md` describes:
   * `"schemaVersion": 1`, `"fetchedAt"`: the current time in ISO 8601 UTC, `"source": "mcp"`.
   * `"collected": { "auditLogDays": 30, "deep": false, "includesArchivedGates": false }`, because the MCP list tools do not return archived gates.
   * The items under `gates`, `experiments`, `dynamicConfigs`, `segments`, `metrics`, `layers`, `holdouts`, `tags` and `auditLogs`.
   * `null` for any list you did not read, with the reason under `"unavailable"`, for example `{ "holdouts": "no MCP read tool" }` or `{ "tags": "not requested" }`. Set `users` and `reviewSettings` to `null` unless you read them.

If a Statsig tool reports a sign-in or permission error, stop and tell the user what it said. Suggest they reconnect Statsig in their connector settings, or run `/mcp` in Claude Code.

### Source 2: a snapshot file

Use this when the user attached or named a snapshot file. The statsig-audit command-line tool saves one with its `--save-snapshot` option. Pass the file's path to the runner as it is, and do not copy its contents into the conversation.

### Source 3: the bundled sample project

Use this when the user asks to try the audit or see a demo, or has nothing connected and wants to see what it does. The snapshot is `${CLAUDE_SKILL_DIR}/assets/sample-snapshot.json`, a fictional project called Acme Pantry. Say clearly in your answer that the results are for a fictional sample project, not the user's, and that its console links point to that fictional project, so they will not open.

### None of these

If the user has not said they use Statsig, first ask which feature flag tool they use. This skill only audits Statsig projects; for another tool, say so and stop.

For a Statsig user, explain how to connect Statsig's MCP server, offer to run the sample project instead, and stop:

* **claude.ai and Cowork:** add a custom connector in your connector settings with the URL `https://api.statsig.com/v3/mcp`, then sign in to Statsig when asked.
* **Claude Code:** run `claude mcp add --transport http statsig https://api.statsig.com/v3/mcp` in a terminal, then run `/mcp` in Claude Code and sign in to Statsig.
* Statsig's guide: https://docs.statsig.com/integrations/mcp/overview
* If they already use the statsig-audit command-line tool, a snapshot it saved with `--save-snapshot` works too: they can attach it (source 2).

## Step 2: run the audit

1. Create a private temporary directory and note the path it prints:

   ```bash
   node -e "const fs=require('fs'),os=require('os'),p=require('path');console.log(fs.mkdtempSync(p.join(os.tmpdir(),'statsig-audit-')))"
   ```

   If `node` is not found, or the runner later says this Node.js is too old, follow "If Node.js is not available" below.

2. For source 1, write the snapshot to `<dir>/snapshot.json`.
3. Run the engine. `<snapshot>` is `<dir>/snapshot.json`, the user's snapshot file, or `${CLAUDE_SKILL_DIR}/assets/sample-snapshot.json`:

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/run.mjs" --input "<snapshot>" --format json --out "<dir>/report.json" <options>
   ```

   Add `--config <file>` when the user names a config file, or when the working directory has a `.statsig-audit.json`.

   * Exit code 0: the report is written.
   * Exit code 2 and `<dir>/report.json` exists: the report is written, but one or more checks failed to run. The message names them. Go on to step 4 and list those checks under "could not run" in the plan.
   * Exit code 2 and no `<dir>/report.json`: a usage, config or snapshot problem. For a snapshot you assembled, fix it from the message and run again. Otherwise show the message and stop.

4. Read `<dir>/report.json`. It has `summary` (counts and the hygiene score), `checks` (each check's status, and the reason when it could not run) and `findings` (each with `severity`, `entity`, `message` and `action`).
5. Delete `<dir>`, snapshot included:

   ```bash
   node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" "<dir>"
   ```

### If Node.js is not available

Say plainly that Node.js 20 or newer is not available here, so the bundled engine cannot run. Then apply the checks in `references/checks.md` to the snapshot yourself, and label the result "manual pass, results may differ from the engine". Delete any temporary files you wrote.

## Step 3: write the action plan

Base everything on the report. Use its messages, actions, owners and permalinks. Never add findings or entities it does not contain.

1. **Headline.** Findings by severity, the hygiene score, and the checks that could not run with the reason. For the sample project, start with "Fictional sample project".
2. **This week** (high). One line per finding: the entity id linked to its permalink, what is wrong, what to do, and the owner.
3. **This quarter** (medium). Grouped by owner, then by check, one line per finding.
4. **Hygiene** (low). Grouped by check with counts. List up to 10 entity ids per check, then "and N more".
5. **Next steps.** If checks could not run, say what data they need, for example the project member list for G14. Offer to suggest thresholds and an ignore list for a `.statsig-audit.json` config file.

Use "no owner" when the owner is empty. Keep the plan under 60 lines unless the user asks for everything.
