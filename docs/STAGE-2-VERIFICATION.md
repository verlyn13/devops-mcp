Stage 2 Verification — Agent D (MCP)

Scope
- OpenAPI accessibility at standard endpoints
- Alias parity in OpenAPI docs for discovery routes
- Generated TypeScript client presence/health
- Type checks on the project

Prerequisites
- Node 24 and pnpm installed
- MCP server running locally or accessible via `MCP_URL` (default: http://127.0.0.1:4319)
- Token in `MCP_BRIDGE_TOKEN` or default `devops-mcp-bridge-token-2024`

Commands
- Static alias parity check:
  - `node scripts/validate-alias-parity.mjs`
- Full Stage 2 validation (static + optional runtime + typecheck):
  - `MCP_URL=http://127.0.0.1:4319 MCP_BRIDGE_TOKEN=<token> ./scripts/validate-stage-2.sh`
- Include optional Bridge checks (env-gated):
  - `INCLUDE_BRIDGE_CHECKS=true OBS_BRIDGE_URL=http://127.0.0.1:7171 ./scripts/validate-stage-2.sh`
- Combined regeneration + validation:
  - `pnpm run stage:2:full`
- Include Bridge runtime checks (requires OBS Dashboard running on port 7171):
  - `INCLUDE_BRIDGE_CHECKS=true OBS_BRIDGE_URL=http://127.0.0.1:7171 ./scripts/validate-stage-2.sh`
- Regenerate client and run full validation:
  - `pnpm run stage:2:full`

Expected Results
- docs/openapi.yaml version == 1.1.0
- OpenAPI documents both base and alias discovery endpoints:
  - `/api/discovery/services` and `/api/obs/discovery/services`
  - `/api/discovery/schemas` and `/api/obs/discovery/schemas`
  - `/api/discovery/openapi` and `/api/obs/discovery/openapi`
- OpenAPI documents self-status at:
  - `/api/mcp/self-status` and `/api/self-status`
- Generated client present at `src/generated/mcp-client` (DefaultApi available)
- `pnpm check` passes

Client Generation
- Generate or refresh the MCP client:
  - `MCP_BASE_URL=http://127.0.0.1:4319 ./scripts/generate-openapi-client-mcp.sh src/generated/mcp-client`
- Demo usage (adjust basePath and token):
  - `tsx examples/mcp-client-demo.ts`

Notes
- Runtime checks require a running bridge; static checks will still run without it.
- Keep generated clients unmodified; regenerate on spec change.
