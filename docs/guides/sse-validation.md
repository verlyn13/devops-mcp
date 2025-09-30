SSE Validation Guide (Stage 3)

Overview
- Validates the Server-Sent Events stream emitted by the MCP server against `schema/obs.line.v1.json` using Ajv.

Defaults
- OBS_BRIDGE_URL: http://127.0.0.1:7171

Quick Start
- Basic check:
  - `OBS_BRIDGE_URL=http://127.0.0.1:7171 node scripts/sse-validate.mjs`
- With filters and limits:
  - `OBS_BRIDGE_URL=http://127.0.0.1:7171 node scripts/sse-validate.mjs --event ConvergeApplied --limit=50 --timeoutMs=8000`
- Filter keys supported: `run_id`, `event`, `tool`, `profile`, `project_id`

Exit Codes
- 0: All streamed events validated against schema (within the limit/timeout)
- 1: One or more events failed schema validation
- 2: Unable to connect to the SSE stream

Notes
- When `TELEMETRY_LOKI_URL` is set on the server, the SSE stream is backed by Loki queries.
- Otherwise, the stream tails the local JSONL log file defined by telemetry settings.
- In CI or local tests you can synthesize an event when the Bridge test endpoints are enabled:
  - `BRIDGE_TEST_ENDPOINTS=1` and then:
  - `curl -sSf -X POST "$OBS_BRIDGE_URL/api/test/emit-event" -H 'content-type: application/json' -d '{"event":"CIEvent","run_id":"ci","tool":"ci","profile":"ci","project_id":"ci"}'`
