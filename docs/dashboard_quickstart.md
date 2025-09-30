Dashboard Quickstart

Goals
- Read `telemetry_info` with versioning/caching
- Validate events via strict JSON Schema (Ajv)
- Subscribe to live events (SSE)
- Build trace deep links
- Interpret SLO fields and alert routes

Endpoints
- MCP resource: `devops://telemetry_info`
- HTTP shim (enable in config `[dashboard_bridge] enabled=true, port=4319`):
  - `GET /api/telemetry-info` → same JSON (ETag + TTL)
  - `GET /api/health` → basic reachability
  - `GET /api/events?limit=100&since=<epoch_ms>&project_id=<id>` → recent events (paginated; optional filters: run_id, event, tool, profile, project_id)
  - `GET /api/events/stream?project_id=<id>` → SSE stream (supports same filters)
  - `POST /api/tools/mcp_health` → returns MCP health/policy snapshot
  - `POST /api/tools/system_plan` → body: `{ profile?, host?, ref? }`
  - `POST /api/tools/system_converge` → body: `{ profile?, host?, ref?, confirm? }` (requires `[dashboard_bridge] allow_mutations=true` when `confirm=true`)
  - `POST /api/tools/patch_apply_check` → body: `{ repo, unifiedDiff, reverse?, checkOnly? }`
  - `GET /api/projects?q=<substr>&kind=<node|go|python|mix|generic>&detectors=git,mise&sort=name|kind|id|detectors&order=asc|desc&page=1&pageSize=50` → paginated inventory with filters
  - `GET /api/projects/:id` → combined manifest + status
  - `GET /api/projects/:id/health` → health summary

Versioning & cache
- `contractVersion`, `schemaVersion`, `etag`, `cacheTtlSec` in `telemetry_info` allow cache + change detection.

Schema validation (Node/TS)
```ts
import Ajv from 'ajv';
import schema from '../vendor/log_events.strict.schema.json';
const ajv = new Ajv({ allErrors:true, strict:true });
const validate = ajv.compile(schema);
export function parseEvent(line: string) {
  const obj = JSON.parse(line);
  if (!validate(obj)) throw new Error('invalid event: '+JSON.stringify(validate.errors));
  return obj;
}
```

SSE consumer
```js
const es = new EventSource('http://localhost:4319/api/events/stream');
es.onmessage = (e) => {
  try { const ev = JSON.parse(e.data); /* validate + render */ } catch {}
};
```

Trace links
- `telemetry_info.tracing.deepLink` is a template with `{trace_id}` placeholder. Build links for events that include `trace_id`.

SLOs & alerting
- `telemetry_info.slos` shows thresholds; `SLOBreach` events include `run_id` and may trigger webhook.
- `telemetry_info.alerting` shows whether alerting is enabled and profile routes.

Retention & pagination
- `telemetry_info.retention` documents days/maxBytes/backend. Use `limit`/`since` in HTTP shim for basic paging.
