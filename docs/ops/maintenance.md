Operations & Maintenance

Overview
- This MCP server is designed for local reliability and low-touch care.
- Key tasks are exposed as tools and HTTP endpoints to support automation.

Rotation & Caps
- Logs: rotates daily or when exceeding telemetry.logs.max_file_mb (min 8MB)
- Audit JSONL: server_maintain rotates when exceeding audit.jsonlMaxMB and prunes rotated files older than audit.retainDays
- Self-status history: in-memory only, bounded by diagnostics.self_history_max

CLI commands
- One-shot maintenance (checkpoint, retention, cache prune, JSONL rotation):
  - pnpm run maintain
- Integration check (MCP tool):
  - integration_check (via MCP)
- Observations validate (MCP tool):
  - obs_validate (reports registry + observation dirs)
- Observations migrate (MCP tool):
  - obs_migrate (compose observations.ndjson from per-observer files)

HTTP endpoints (bridge)
- POST /api/tools/server_maintain
- GET /api/self-status, /api/self-status/history, /api/self-status/now
- GET /api/obs/validate
- GET /api/discover (manual), /api/projects (auto-discovers when empty)

Data paths
- Registry: ~/.local/share/devops-mcp/project-registry.json
- Observations (merged):
  - Preferred: ~/.local/share/devops-mcp/observations
  - MCP default: ~/Library/Application Support/devops.mcp/observations

Tips
- Align [observers].out_dir to the preferred XDG path for clean convergence.
- Set [dashboard_bridge] enabled=true, port=7171 for local dashboards and agents.
