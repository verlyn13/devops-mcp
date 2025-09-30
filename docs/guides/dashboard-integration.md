Dashboard Integration Guide

Overview
- MCP bridge base URL: http://localhost:<port> (see [dashboard_bridge] in config)
- Auth: Optional Bearer token via Authorization header if configured

Core Endpoints
- GET /api/telemetry-info → full telemetry contract and endpoints summary
- GET /api/health → basic reachability
- GET /api/self-status → self diagnostics snapshot
- GET /api/self-status/history?limit=60 → { points, summary }
- GET /api/events?limit=100&since=<ms>&project_id=<id> → recent events
- GET /api/events/stream?project_id=<id> → SSE stream (filters: run_id,event,tool,profile,project_id)
 - Aliases for dashboard parity (prefer under /api/obs/* when convenient):
   - GET /api/obs/well-known → /.well-known/obs-bridge.json
  - GET /api/obs/discovery/schemas → /api/discovery/schemas
  - GET /api/obs/discovery/services → /api/discovery/services
   - GET /api/obs/schemas/:name → /api/schemas/:name
   - GET /api/obs/projects/:id/manifest → /api/projects/:id/manifest (checkedAt epoch ms)
   - GET /api/obs/projects/:id/integration → /api/projects/:id/integration (checkedAt epoch ms)
   - Observer data: /api/obs/projects/:id/observers, /api/obs/projects/:id/observer/:type

Projects
- GET /api/projects?q=&kind=&detectors=git,mise&sort=name|kind|id|detectors&order=asc|desc&page=&pageSize=
- GET /api/projects/:id → { manifest, status }
- GET /api/projects/:id/health → { ok, status }
- GET /api/projects/:id?observer=git&timeoutMs=1000 → filter status and set per-call timeout

Tools
- POST /api/tools/project_discover → {}
- POST /api/tools/project_obs_run → { project_id, observer? } (observer ∈ git|mise|build|sbom|manifest)
- POST /api/tool/project_obs_run → alias for older proxies
- POST /api/tools/mcp_health → {}
- POST /api/tools/server_maintain → {}
- POST /api/tools/project_health → {}
- POST /api/tools/patch_apply_check → { repo, unifiedDiff, reverse?, checkOnly? }
- POST /api/tools/obs_validate → validates observation dirs + registry presence
- POST /api/tools/obs_migrate → composes observations.ndjson from per-observer files

Contracts
- project_obs_run
  - Request: { project_id: string, observer?: enum }
  - Response: { ok: boolean, observer?: string, detail: { project, status, external? } }
  - external: { ok, wrote, file } when an external observer script exists and produces NDJSON

Observer Scripts
- Location: [observers] dir in config (e.g., system-setup-update/observers)
- Naming: <observer>-observer.sh (git-observer.sh, manifest-observer.sh, ...)
- Input: $1 = project root path
- Output: NDJSON (one JSON object per line) to stdout
- Server stores: <observers.out_dir>/<project_id>/<observer>.ndjson (rotated by size)

Retries/Timeouts
- safeExecFile enforces timeouts (default per command, override via observers.timeout_ms or per-request timeoutMs)
- Git observers use small retry/backoff internally for status

Integration Check
- MCP Tool: integration_check → { ok, checks[] }
- Probes self-status, projects, project_discover, mcp_health, and internal discovery

Notes
- For local-only use, auth tokens are optional. For shared environments, set [dashboard_bridge] token.
- Logs and audit are size-capped and rotated to avoid disk bloat; see telemetry.logs.max_file_mb and audit.jsonlMaxMB.
- Validate manifest via: GET /api/projects/:id/manifest; CLI: scripts/validate-manifest.mjs (PROJECT_ID required)
- Many responses include a `checkedAt` epoch ms field; display it in cards (e.g., ManifestCard, IntegrationCard) as "last checked".
 - Prefer the typed schemas in docs/openapi.yaml components and /schema for client codegen and validation.
