SSE Validation Guide (Stage 3)

Overview
- Validates the Server-Sent Events stream emitted by the MCP server against `schema/obs.line.v1.json` using Ajv.

Defaults
- MCP_URL: http://127.0.0.1:4319

Quick Start
- Basic check:
  - `MCP_URL=http://127.0.0.1:4319 node scripts/sse-validate.mjs`
- With filters and limits:
  - `MCP_URL=http://127.0.0.1:4319 node scripts/sse-validate.mjs --event ConvergeApplied --limit=50 --timeoutMs=8000`
- Filter keys supported: `run_id`, `event`, `tool`, `profile`, `project_id`

Exit Codes
- 0: All streamed events validated against schema (within the limit/timeout)
- 1: One or more events failed schema validation
- 2: Unable to connect to the SSE stream

Notes
- When `TELEMETRY_LOKI_URL` is set on the server, the SSE stream is backed by Loki queries.
- Otherwise, the stream tails the local JSONL log file defined by telemetry settings.

