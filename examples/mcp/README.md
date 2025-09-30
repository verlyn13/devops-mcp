MCP Setup (Examples)

Quick start
- Copy examples/mcp/config.example.toml to your MCP config path (e.g., ~/.config/devops-mcp/config.toml) and adjust paths.
- Set environment variables as needed:
  - OBS_BRIDGE_URL=http://127.0.0.1:7171
  - BRIDGE_TOKEN=... (optional for local), DS_TOKEN=... (if DS is secured)
  - DS_BASE_URL=... (if discovery registry is not present)

Recommended configuration
- Align observer paths to XDG for bridge convergence:
  - [observers].out_dir = ~/.local/share/devops-mcp/observations
  - [observers].dir = "/path/to/system-setup-update/observers"
- Enable the local bridge for dashboard:
  - [dashboard_bridge] enabled = true, port = 7171

Test curls
- Manifest validation:
  - curl "$OBS_BRIDGE_URL/api/projects/<id>/manifest" | jq
- Service discovery:
  - curl "$OBS_BRIDGE_URL/api/discovery/services" | jq
- Observations validate (tool):
  - curl -X POST "$OBS_BRIDGE_URL/api/tools/obs_validate" | jq
- Observations migrate for one project:
  - curl -X POST "$OBS_BRIDGE_URL/api/tools/obs_migrate" -H 'content-type: application/json' -d '{"project_id":"<id>"}' | jq

Notes
- You may also call the MCP tools directly (obs_validate, obs_migrate, integration_check) via your MCP runner.
- The bridge auto-discovers projects on first /api/projects unless BRIDGE_AUTO_DISCOVER=0.
