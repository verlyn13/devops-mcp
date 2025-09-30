Environment & Configuration

Bridge-related env vars
- BRIDGE_AUTO_DISCOVER: when not '0', the bridge will run discovery on first /api/projects if the registry is empty (default: enabled).
- DS_BASE_URL: base URL for DS service discovery (used by /api/discovery/services and /api/projects/:id/integration).
- DS_TOKEN: Bearer token for DS capability/health probes.
- MCP_BASE_URL: base URL for MCP (defaults to http://127.0.0.1:<dashboard_bridge.port>).

MCP config (config.toml)
- [dashboard_bridge]: enable bridge and set port (e.g., 7171); optional token.
- [observers]: dir with observer scripts, out_dir for NDJSON, and timeout_ms.
- [allow]: include 'bash' and 'sh' in commands; ensure PATH dirs include shell locations.
- [telemetry.logs]: max_file_mb for rotation.
- [audit]: jsonlMaxMB for JSONL rotation.
- [diagnostics]: self_history_max for in-memory snapshots.

Paths
- Registry: ~/.local/share/devops-mcp/project-registry.json
- Observations (merged): ~/.local/share/devops-mcp/observations (preferred)
- Observations (MCP default): ~/Library/Application Support/devops.mcp/observations

Strict modes (bridge)
- BRIDGE_STRICT / BRIDGE_STRICT_FAIL: recommended for DS; MCP endpoints here return structured errors and always prefer compact NDJSON.
