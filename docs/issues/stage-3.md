---
title: Stage 3 — SSE & Observers
category: tracking
component: MCP
status: active
version: 1.1.0
last_updated: 2025-09-30
---

# Stage 3 — SSE & Observers

Epic: <link to MVP Orchestration Epic>
Owners: @AgentA @AgentB @AgentC @AgentD

## Entrance Criteria
- [x] Stage 2 complete (typed clients/adapters integrated; no contract drift)

## Tasks (Agent D — MCP)

### SSE
- [ ] `/api/events/stream` streams with `text/event-stream`, heartbeat every 15s
- [ ] Backpressure-aware writer (pause on `drain`, resume)
- [ ] Filters: `run_id`, `event`, `tool`, `profile`, `project_id`
- [ ] Auth parity with Bridge (Bearer token) when configured
- [ ] OpenAPI documents `/api/events/stream` with content-type and filters

### Observers
- [ ] Document locations and files (per OS)
- [ ] Validate migration tool `/api/tools/obs_migrate` remains correct
- [ ] Observer endpoints: `/api/obs/projects/{id}/observers`, `/api/obs/projects/{id}/observer/{type}`

### Validation & CI
- [ ] `scripts/sse-validate.mjs` validates N events via Ajv against `schema/obs.line.v1.json`
- [ ] Add optional SSE smoke in CI (`SSE_SMOKE=1`) to `validate-endpoints.yml`
- [ ] Spectral rule ensures `/api/events/stream` present in OpenAPI

## Validation Steps

```bash
# SSE quick validation (Bridge)
OBS_BRIDGE_URL=http://127.0.0.1:7171 node scripts/sse-validate.mjs --limit=20 --timeoutMs=8000

# With filters
OBS_BRIDGE_URL=http://127.0.0.1:7171 node scripts/sse-validate.mjs --event ConvergeApplied --project_id myproj

# Run unit SSE test
pnpm test -t sse stream
```

## Acceptance
- [ ] SSE stream is reliable (heartbeat, backpressure) and filtered
- [ ] Events validate against schema in smoke
- [ ] OpenAPI + docs accurate; CI gates green
