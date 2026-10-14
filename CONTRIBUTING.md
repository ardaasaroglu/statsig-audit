# Contributing

Small, focused changes are welcome. A few rules keep statsig-audit what it is.

1. **Read only, always.** No code path may send anything but GET, call `/keys`, or call a write or cleanup endpoint.
2. **The key goes nowhere.** Everything the CLI writes passes through the redactor in `src/lib/redact.js`. If you add an output, route it through the same writers and extend `test/redaction.test.js`.
3. **Fictional data only.** Tests, fixtures, examples and screenshots use the fictional Acme Pantry project and `.example` or `.test` domains. Never paste a real snapshot, report or key into an issue, a test or a commit.
4. **A check is a pure function.** It takes `(snapshot, config, now)` and returns findings. It reads the time only from `now`.
5. **Complement Statsig.** A new check should find something Statsig does not flag, or make one of Statsig's own flags more useful. Its `overlap` field says which.

## Development

You need Node 20 or newer. There are no dependencies to install.

```bash
npm test                                                   # every test, a few seconds
node bin/statsig-audit.js --input test/fixtures/snapshot.json  # the report for the fictional fixture
npm run docs                                               # rebuild docs/checks.md from the check modules
npm run golden                                             # rebuild examples/sample-report.md and .json
npm run check:generated                                    # what CI runs: fails if either is out of date
```

The test suite never talks to Statsig. Tests that need HTTP start a server on `127.0.0.1` (`test/helpers/mock-server.js`). Three environment variables exist for those tests: `STATSIG_AUDIT_API_BASE` points the client at the local server, and `STATSIG_AUDIT_RETRY_BASE_MS` and `STATSIG_AUDIT_MIN_INTERVAL_MS` shorten waits. The CLI only accepts a loopback address in the first, and ignores the other two unless the base is loopback. Tests that run the CLI as a child process pass a short list of variables and never inherit `STATSIG_CONSOLE_API_KEY` from your shell.

## Adding a check

1. Add a module in `src/checks`, modelled on an existing one. Fill in every metadata field: `id`, `title`, `what`, `severity`, `appliesTo`, `requires`, `rationale`, `action`, `overlap`, and `deep` or `settings` when they apply.
2. Register it in `src/checks/index.js` and in the `checkId` list in `docs/config.schema.json`.
3. Add at least one test that must find something and one that must not, in `test/checks.test.js`.
4. Give `test/fixtures/snapshot.json` an entity for it to find. The file uses the snapshot format in `docs/snapshot-format.md`.
5. Run `npm run docs` and `npm run golden`, and commit the results.

Found a security problem? Follow [SECURITY.md](SECURITY.md) and do not open a public issue.
