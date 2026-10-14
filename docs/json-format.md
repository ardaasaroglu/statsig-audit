# JSON output format

`statsig-audit --format json` writes one JSON object. The exact schema is [report.schema.json](report.schema.json) (JSON Schema 2020-12). The test suite validates the sample report, and reports built from partial and empty snapshots, against that file. The schema forbids fields it does not list, so the code and the schema cannot drift apart unnoticed.

`schemaVersion` is `1`. It changes only when a field is removed or changes meaning. A later tool version may add optional fields without changing `schemaVersion`, and its copy of the schema lists them. Validate a report against the schema from the same tool version (`tool.version`), and have readers ignore fields they do not know.

## Top level

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Version of this format. |
| `tool` | object | `{ "name": "statsig-audit", "version": "0.1.0" }` |
| `evaluatedAt` | string | ISO 8601 time that ages were counted to. With `--input` this is the snapshot time unless `--now` is given. |
| `snapshot` | object | Where the data came from, see below. |
| `summary` | object | Counts, score and inventory, see below. |
| `checks` | array | One entry per check in the catalog, in catalog order. |
| `findings` | array | Findings after the ignore list, sorted by severity, then check order, then entity. |
| `suppressed` | array | Findings the ignore list removed: `{ check, entity: { type, id }, reason }`. |

## `snapshot`

| Field | Type | Meaning |
| --- | --- | --- |
| `fetchedAt` | string or null | When the data was read. |
| `source` | string | `console-api` for a live run, `mcp` for a snapshot assembled from Statsig MCP tools, `fixture` for test data, `file` when a snapshot did not say. |
| `projectName` | string or null | Only when the snapshot carries one. The Console API does not return it. |
| `auditLogDays` | integer or null | Days of audit log that were read. |
| `deep` | boolean | Whether detail calls were made. |
| `requests` | integer or null | GET requests made in this run, or null when a saved snapshot was read. |

## `summary`

| Field | Type | Meaning |
| --- | --- | --- |
| `findings` | integer | Number of findings. |
| `bySeverity` | object | `{ "high": n, "medium": n, "low": n }` |
| `suppressed` | integer | Number of findings the ignore list removed. |
| `score` | object or null | `{ value, cleanEntities, auditedEntities }`, see below. Null when nothing was audited. |
| `inventory` | object | Counts per entity type: `gates`, `dynamicConfigs`, `experiments`, `segments`, `metrics`, `layers`, `holdouts`, `tags`, `auditLogs`, `users`. Each is null when that list was not collected. |

### The hygiene score

`value` is the share of audited entities that have no high or medium finding, from 0 to 100, rounded. Audited entities are gates, dynamic configs, experiments, segments, custom metrics, explicit layers and holdouts that are not archived. Built-in metrics and implicit layers are not counted. Low findings, suppressed findings and project-level findings do not lower it.

It is a ratio, not a benchmark. It goes up when you fix or archive things, and it is only comparable between runs of the same project with the same config and checks.

## `checks[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Check id, such as `G02`. |
| `title` | string | Check title. |
| `severity` | `high`, `medium` or `low` | The check's default severity. A finding may differ. |
| `status` | `ran`, `skipped`, `disabled` or `error` | `skipped` when the snapshot lacks data the check needs, `disabled` when the config or `--checks` turned it off, `error` when the check threw. |
| `reason` | string or null | Why it was skipped or failed. |
| `findings` | integer | Findings it produced after the ignore list. |
| `suppressed` | integer | Findings the ignore list removed. |

## `findings[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `check` | string | Check id. |
| `title` | string | Check title. |
| `severity` | `high`, `medium` or `low` | Severity of this finding. |
| `entity` | object | The entity, see below. |
| `message` | string | What is wrong with this entity, in one or two sentences. |
| `action` | string | What to do about it. |
| `related` | array | Other entities involved, in the same shape as `entity`. For example, the other copies of a duplicated ID list. |

### `entity`

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | string | `gate`, `dynamicConfig`, `experiment`, `segment`, `metric`, `layer`, `holdout`, `project` or `tag`. |
| `id` | string | Statsig id. For metrics it is `name::type`. |
| `name` | string or null | Display name, only when it differs from the id. |
| `permalink` | string or null | Console link, when Statsig returned one. |
| `owner` | string or null | Owner name. Never an email. |
| `ownerEmail` | string or null | Null unless the report was made with `--show-emails`. |

Without `--show-emails`, email addresses anywhere in the report are masked to their first character and domain.
