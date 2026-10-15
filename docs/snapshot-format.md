# Snapshot format

A snapshot is everything the checks read, in one JSON object. The CLI builds one from the Console API on every live run. `--save-snapshot <file>` writes it to disk, and `--input <file>` audits a saved one without calling the API. The Claude plugin assembles one from the read tools of the user's own Statsig MCP connection, or takes a saved one, and audits it offline with a bundled copy of the same engine.

A snapshot holds project data: entity names, rules, targeting values, owner names and emails. It never holds the API key. Keep snapshots out of public repositories.

## Shape

```json
{
  "schemaVersion": 1,
  "fetchedAt": "2026-10-14T09:00:00.000Z",
  "source": "console-api",
  "project": { "name": null },
  "collected": { "auditLogDays": 30, "deep": false, "includesArchivedGates": true },
  "unavailable": { "users": "not requested" },
  "gates": [],
  "dynamicConfigs": [],
  "experiments": [],
  "segments": [],
  "metrics": [],
  "layers": [],
  "holdouts": [],
  "tags": [],
  "auditLogs": [],
  "users": null,
  "reviewSettings": { "is_config_review_required": true, "is_metric_review_required": false },
  "details": { "gateChecks": {}, "cumulativeExposures": {} }
}
```

* `fetchedAt` is required. Every other field is optional.
* Each list holds items **as the Console API returns them**, with the same field names. The loader keeps only the fields the checks use and drops the rest, including dynamic config values, rule return values and audit log change bodies.
* A list that is missing or `null` means "not collected". Checks that need it are reported as could not run, never as clean. Say why under `unavailable`, keyed by the list name.
* `collected.includesArchivedGates` should be `false` when archived gates could not be read. Then a reference to a gate that is not in the list is reported as "not found, may be archived" instead of "does not exist".
* `source` is free text that the report shows. The CLI writes `console-api`. The plugin writes `mcp` for a snapshot it assembles from Statsig MCP tools.

## Lists and the API calls behind them

| Field | Console API call | Fields the checks use |
| --- | --- | --- |
| `gates` | `GET /console/v1/gates?includeArchived=true` | `id`, `name`, `description`, `owner`, `tags`, `createdTime`, `lastModifiedTime`, `permalink`, `status`, `isEnabled`, `type`, `typeReason`, `checksPerHour`, `archivedAt`, `rules[]`, `reviewSettings.requiredReview` |
| `dynamicConfigs` | `GET /console/v1/dynamic_configs` | as gates, plus `isPermanent` |
| `experiments` | `GET /console/v1/experiments` | `id`, `status`, `hypothesis`, `startTime`, `decisionTime`, `endTime`, `duration`, `targetExposures`, `launchedGroupID`, `groups[]`, `primaryMetrics[]`, `secondaryMetrics[]`, the four correction flags, `healthCheckStatus`, `healthChecks[]`, `targetingGateID`, `layerID`, `inlineTargetingRules[]`, plus the common fields |
| `segments` | `GET /console/v1/segments` | `id`, `type`, `count`, `isEnabled`, `rules[]`, plus the common fields |
| `metrics` | `GET /console/v1/metrics/list?showHiddenMetrics=true` | `id`, `name`, `type`, `description`, `isVerified`, `isHidden`, `isReadOnly`, `owner`, `tags`, `permalink` |
| `layers` | `GET /console/v1/layers` | `id`, `isImplicitLayer`, `lastModifiedTime`, plus the common fields |
| `holdouts` | `GET /console/v1/holdouts` | `id`, `isEnabled`, `gateIDs`, `experimentIDs`, `layerIDs`, `targetingGateID` |
| `tags` | `GET /console/v1/tags` | `id`, `name`, `isCore` |
| `auditLogs` | `GET /console/v1/audit_logs?startDate=&endDate=` | `name`, `actionType`, `date`, `time`, `updatedBy`, `updatedByUserID` |
| `users` | `GET /console/v1/users` (only with `--users`) | `userID`, `email` |
| `reviewSettings` | `GET /console/v1/settings/reviews` (an object, not a list) | `is_config_review_required`, `is_metric_review_required` |

The common fields are `id`, `name`, `description`, `owner` (`{ ownerID, ownerType, ownerName, ownerEmail }`), `tags`, `createdTime`, `lastModifiedTime` and `permalink`. Times are epoch milliseconds, as the API returns them.

A rule is `{ name, passPercentage, environments, conditions[], pendingAutomatedRollouts[] }`, and a condition is `{ type, operator, field, targetValue }`, as in the API.

Audit log entries carry a human-readable `date` and `time` (for example `"Mon Oct 12 2026"` and `"22:10:52 GMT+0000 (Coordinated Universal Time)"`). The loader turns them into a `timestamp`. A snapshot may also give `timestamp` directly, in epoch milliseconds.

## `details`

Filled only by `--deep`:

* `gateChecks`: `{ "<gate id>": { "has_production_checks_in_last_7_days": false } }` from `GET /console/v1/gates/{id}/checks`, for gates with a check rate of 0.
* `cumulativeExposures`: `{ "<experiment id>": [ { "groupID", "groupName", "results": [ { "date", "exposures" } ] } ] }` from `GET /console/v1/experiments/{id}/cumulative_exposures`, for active experiments with a target number of exposures.

## Example

[test/fixtures/snapshot.json](../test/fixtures/snapshot.json) is a complete snapshot of a fictional project. It drives the tests and the sample report. The Claude plugin bundles a copy as `assets/sample-snapshot.json` in its skill folder, with one extra `$comment` field that the loader ignores.
