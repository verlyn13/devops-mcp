MCP Setup and Verification

Config
- Copy examples/mcp/config.example.toml to your MCP config, e.g.:
  - macOS: ~/.config/devops-mcp/config.toml
- Ensure:
  - [dashboard_bridge] enabled = true, port = 7171
  - [observers].out_dir = ~/.local/share/devops-mcp/observations (XDG)
  - [observers].dir points to your observers repo (e.g., system-setup-update/observers)
  - [audit].dir defaults OK; JSONL fallback enabled when sqlite binding missing

Environment (optional)
- DS_BASE_URL for discovery probes; DS_TOKEN if your DS requires auth
- BRIDGE_TOKEN if you set a token for the dashboard bridge

Run
- pnpm dev
- The dashboard bridge serves HTTP parity endpoints for the dashboard at http://127.0.0.1:7171

Quick checks
- BRIDGE_URL=http://127.0.0.1:7171 ./scripts/check-bridges.sh
- node scripts/validate-endpoints.mjs
- PROJECT_ID=<id> node scripts/validate-endpoints.mjs

Curls
- Service discovery: curl "$BRIDGE_URL/api/discovery/services" | jq
- Manifest: curl "$BRIDGE_URL/api/projects/<id>/manifest" | jq
- Integration: curl "$BRIDGE_URL/api/projects/<id>/integration" | jq
- Observers (merged): curl "$BRIDGE_URL/api/obs/projects/<id>/observers" | jq
- Observer (filtered): curl "$BRIDGE_URL/api/obs/projects/<id>/observer/git" | jq

Tools
- Validate: curl -X POST "$BRIDGE_URL/api/tools/obs_validate" | jq
- Migrate: curl -X POST "$BRIDGE_URL/api/tools/obs_migrate" -H 'content-type: application/json' -d '{"project_id":"<id>"}' | jq

Typed Clients (optional)
- Bridge client: ./scripts/generate-openapi-client.sh examples/dashboard/generated/bridge-client
- DS client: DS_BASE_URL=... ./scripts/generate-openapi-client-ds.sh examples/dashboard/generated/ds-client
- MCP client: MCP_BASE_URL=... ./scripts/generate-openapi-client-mcp.sh examples/dashboard/generated/mcp-client

