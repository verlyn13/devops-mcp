Telemetry and Logging

Overview
- Structured logging uses Pino with newline-delimited JSON.
- Traces and metrics export via OTLP/HTTP when enabled.
- Secret redaction is automatic and configurable.

Endpoints
- OTLP endpoint base: `telemetry.endpoint` (default `http://127.0.0.1:4318`).
  - Traces: `${endpoint}/v1/traces`
  - Metrics: `${endpoint}/v1/metrics`
  - Logs: `${endpoint}/v1/logs` (enabled when `telemetry.export = "otlp"`)
- Logs:
  - Local dev (`telemetry.env=local`):
    - Pretty output to TTY
    - JSON log file: `${audit.dir}/logs/server.ndjson`
  - Prod/CI (non-local): JSON to stderr (capture with your supervisor or collector)

Config (TOML)
```
[telemetry]
enabled = true
export = "otlp"            # or "none"
endpoint = "http://127.0.0.1:4318"
protocol = "http"          # http exporters are used
sample_ratio = 1.0
env = "local"              # controls pretty vs json, default "local"

  [telemetry.logs]
  level = "info"            # debug|info|warn|error
  sink = "stderr"           # stderr|file (local adds file regardless)

  [telemetry.redact]
  paths = ["*.token", "*.password", "OPENAI_API_KEY"]
  censor = "[REDACTED]"

  # Backpressure controls
  max_queue = 2048
```

Event Vocabulary
- `event` field enumerations are stable for dashboards:
  - ConvergePlanned, ConvergeApplied, ConvergeAborted
  - PkgSyncPlanned, PkgSyncApplied, PkgSyncFailed
  - DotfilesApplied, SystemRepoSync, PolicyValidation
  - AuditRetention, RateLimitExceeded
- Common envelope fields on every log line:
  - `service`, `version`, `env`, `host`, optional `trace_id`, `span_id`, `tool`, `msg`, `level`

TypeScript Contract
- Importable types and constants for consumers:
  - `src/lib/telemetry/contract.ts`
  - Exports `TELEMETRY_CONTRACT`, `LOG_EVENT_ENUM`, and `LogEnvelope` union types

Local Paths (macOS default)
- Data dir: `${HOME}/Library/Application Support/devops.mcp`
- Log file (local): `${dataDir}/logs/server.ndjson`
- Audit DB: `${dataDir}/audit.sqlite3` (or `audit.jsonl` when configured)
  - For Node 24 environments without native bindings, set `[audit] kind = "sqlite_wasm"` to use a WASM-backed SQLite (via `sql.js`). Data is persisted to the same `audit.sqlite3` file.

Collector Integration
- OTel Collector (http): set `telemetry.enabled=true` and point `endpoint` to your collector.
- Logs are exported two ways:
  - JSON: stderr in prod/CI, `${dataDir}/logs/server.ndjson` in local
  - OTLP Logs (optional): when `telemetry.export = "otlp"`, a Pino transport bridges to the OTel logs exporter
  - Attribute filtering: the Pino→OTLP transport only forwards an allowlisted set of attributes (e.g., `event`, `tool`, `trace_id`, `span_id`, `service`, `version`, `env`, `host`, common event fields, flattened counts/residuals). Extend via `[telemetry.logs] attributes_allowlist = ["custom.key", "counts.extra"]`. Nested objects are flattened once (e.g., `counts.brew_installs`). Non-primitive and non-allowlisted fields are dropped.

Backpressure & Drops
- The server increments `telemetry_dropped_total{kind="trace|metric|log"}` if exporters drop data.
- It emits a throttled WARN (once per 5 minutes) with cumulative dropped counts.

Dashboards
- Correlate with traces using `trace_id`/`span_id` when present.
- Key dimensions: `event`, `tool`, `profile`, `plan_sha`, `audit_id`, `ok`.

Dashboard bootstrap
- Sample file at `examples/dashboard/bootstrap.json` mirrors `devops://telemetry_info` so dashboards can seed defaults before connecting.
- CI can publish a snapshot of `telemetry_info` and this bootstrap JSON as artifacts for environment discovery.
Reachability
- On startup the server probes the collector and exposes `reachable` and `lastError` via `devops://telemetry_info`.
- It emits a one-shot `TelemetryHealth` log summarizing exporter settings and reachability.
