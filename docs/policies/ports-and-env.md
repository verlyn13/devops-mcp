Ports & Environment Conventions

Canonical Ports
- Bridge (Agent A): 7171
- MCP (Agent D): 4319
- DS (Agent B): 7777

Environment Variables
- Bridge: `OBS_BRIDGE_URL` (fallback `BRIDGE_URL`) → default `http://127.0.0.1:7171`
- MCP: `MCP_URL`, `MCP_BASE_URL` → default `http://127.0.0.1:4319`
- DS: `DS_BASE_URL` → default `http://127.0.0.1:7777`
- Tokens: `BRIDGE_TOKEN`, `MCP_BRIDGE_TOKEN`, `DS_TOKEN` as appropriate

Guidance
- Examples and scripts must read base URLs from env; do not hardcode ports.
- Stage scripts and client generation targeting MCP must default to MCP 4319.
- Only use `OBS_BRIDGE_URL=7171` when explicitly calling Bridge endpoints.
- CI enforces these defaults via `scripts/validate-conventions.mjs`.

