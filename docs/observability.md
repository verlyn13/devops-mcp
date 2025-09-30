Observability & Compatibility Endpoints

Overview
- This server provides compatibility endpoints to interoperate with the system-setup-update bridge expectations.

Discovery
- GET /api/discover → triggers discovery and writes registry to ~/.local/share/devops-mcp/project-registry.json
- Auto-discover on first /api/projects when BRIDGE_AUTO_DISCOVER != 0 and registry missing/empty.

Observer Data
- GET /api/obs/projects/:id/observers → merged NDJSON lines from both directories:
  - ~/.local/share/devops-mcp/observations
  - ~/Library/Application Support/devops.mcp/observations
  - Uses observations.ndjson if present; otherwise reads per-observer *.ndjson.
- GET /api/obs/projects/:id/observer/:type → filtered lines by observer (repo|deps|build|quality|sbom|manifest).

Validation
- GET /api/obs/validate → returns { ok, telemetry, registry: { path, exists }, dirs: [{ path, exists, projects, files }] }

Migration
- Tool: obs_migrate (MCP tool and HTTP POST /api/tools/obs_migrate)
- Merges per-observer *.ndjson into observations.ndjson per project; existing per-observer files remain.

Notes
- project_obs_run also writes per-observer <type>.ndjson so the bridge can merge.
- To converge on a single path, set [observers].out_dir = ~/.local/share/devops-mcp/observations.
- Well-known descriptor is available at /.well-known/obs-bridge.json with version, schemaVersion, and endpoints list.
