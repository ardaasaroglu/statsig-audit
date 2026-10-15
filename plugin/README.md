Unofficial. Not affiliated with, endorsed by, or sponsored by Statsig or its owners. Statsig is a trademark of its respective owner.

## Statsig Audit

Statsig Audit finds what drifts in a Statsig project and tells you what to clean up first. Ask Claude to audit your project and you get a short action plan: what to fix this week, what to plan this quarter, and cheap hygiene fixes. Each item names the owner and links to the entity in the Statsig console. The plugin only reads. It never changes anything in Statsig.

## What it finds

The audit runs 25 checks, grouped by area:

* **Gates.** Gates Statsig marked stale, launched or disabled gates nobody cleaned up, in-progress gates that serve everyone the same value, partial rollouts left alone, and gates with no traffic.
* **Targeting.** Conditions with no values, targeting values that will never match (a stray space, a pasted list, a domain typo), the same ID list pasted into several entities, rules that can never run, and references to missing, archived or disabled gates, segments and layers.
* **Experiments.** Decided or abandoned experiments that were not cleaned up, experiments running past their plan, a missing hypothesis or the wrong metrics, several comparisons with no correction, failing health checks, and a targeting gate that lets nobody in.
* **Dynamic configs, segments, layers and metrics.** Dynamic configs Statsig marked stale, layers no experiment uses, segments nothing uses, and running experiments decided by unverified or hidden metrics.
* **Ownership, process and naming.** Missing descriptions, owners or tags, owners who are no longer project members, rules that keep changing, no required review for changes, and names off convention.

Each finding says why it matters, what to do and who owns it. A hygiene score from 0 to 100 helps you track one project over time.

## How to use it

First connect Statsig's own MCP server under your Statsig account. Then ask Claude for an audit.

**On claude.ai and in Cowork**

1. Add this plugin from Claude's plugin directory. Before it is listed there, you can add the repository github.com/ardaasaroglu/statsig-audit as a plugin marketplace in your plugin settings.
2. In your connector settings, add a custom connector with the URL `https://api.statsig.com/v3/mcp`, and sign in to Statsig when asked.
3. Make sure code execution is turned on in your settings, so the audit engine can run.
4. Ask Claude to audit your Statsig project.

**In Claude Code**

1. Install the plugin from the directory, or from this repository:

   ```bash
   claude plugin marketplace add ardaasaroglu/statsig-audit
   claude plugin install statsig-audit@statsig-audit
   ```

2. Connect Statsig's MCP server with this command, then run `/mcp` in Claude Code and sign in to Statsig:

   ```bash
   claude mcp add --transport http statsig https://api.statsig.com/v3/mcp
   ```

3. Ask Claude to audit your Statsig project, or run `/statsig-audit:audit`.

Statsig's own setup guide is at https://docs.statsig.com/integrations/mcp/overview.

You can also try the audit without a Statsig account. The plugin includes a fictional sample project, and Claude says clearly when a result comes from it. The sample's console links point to that fictional project, so they do not open.

## Example prompts

* "Audit my Statsig project and give me a cleanup plan."
* "Which feature gates in Statsig are stale or stuck in a partial rollout, and who owns them?"
* "Check our running Statsig experiments for a missing hypothesis, missing metrics or failing health checks."
* "Try the Statsig audit on the sample project." This one works without a Statsig account.
* "Audit the Statsig snapshot file I attached and list what to fix this week."

## What it reads and sends

Reads your project only through your own Statsig connection, with read tools. The audit engine runs inside Claude's code environment on a temporary snapshot that is deleted afterwards. The plugin itself makes no network calls, stores nothing, and never sees an API key.

In detail:

* **What it runs.** One bundled Node.js script, `scripts/run.mjs` in the skill folder, which audits a snapshot file and writes a report file. It has no network code and reads only the files it is given. Claude also runs two short Node.js commands that create and delete the temporary folder.
* **What it reads.** What Statsig's MCP read tools return for your project: gates, experiments, dynamic configs, segments, metrics, layers, holdouts, tags and up to 30 days of audit log. The engine drops dynamic config values, rule return values and audit log change bodies when it loads the snapshot, so they never reach the report. It can also read a snapshot file you attach, or the bundled sample project.
* **What it sends.** Nothing. The Statsig connector you added makes its own calls to Statsig under your sign-in. The action plan appears in the conversation, with owner names and without email addresses unless you ask for them.
* **What it never does.** Create, change, archive or clean up anything in Statsig, ask for an API key, or keep a copy of your data.

## Requirements

* For your own project: a Statsig account and Statsig's MCP server connected as described above. A read-only role is enough. The sample project needs neither.
* For the audit engine: code execution with Node.js 20 or newer. On claude.ai and in Cowork, that is Claude's code environment. In Claude Code, it is the Node.js installed on your computer. Without it, Claude applies the checks itself and labels the result "manual pass, results may differ from the engine".

## Troubleshooting

* **Claude finds no Statsig tools.** Connect Statsig's MCP server as described above and sign in, then start a new conversation so the tools load. In Claude Code, `/mcp` shows whether the server is connected.
* **Sign-in or permission errors from Statsig.** Reconnect Statsig in your connector settings, or run `/mcp` in Claude Code. The audit can read only what your Statsig role can read. Statsig's guide says its MCP sign-in works only when your Statsig organization owner has allowed personal Console API keys for your role.
* **Node.js is missing or too old.** On claude.ai, turn on code execution in your settings. In Claude Code, install Node.js 20 or newer. Otherwise Claude does a manual pass, and its results may differ from the engine's.
* **Very large projects.** Claude reads the project through the connector inside the conversation, so thousands of entities take a while and can exceed the conversation's limits. Ask about one area at a time, for example only gates, or audit a snapshot file saved by the statsig-audit command-line tool.
* **A check "could not run".** The report says which data it needed. For example, G14 needs the project member list.

## Privacy

The privacy policy is at https://github.com/ardaasaroglu/statsig-audit/blob/main/PRIVACY.md.

## Support

Ask questions and report bugs at https://github.com/ardaasaroglu/statsig-audit/issues. Please do not paste API keys or real project data into an issue. Report a security problem privately at https://github.com/ardaasaroglu/statsig-audit/security/advisories/new.

The same repository has the source code, the full check catalog and a command-line version for CI.

## License

MIT. See the LICENSE file in this folder.
