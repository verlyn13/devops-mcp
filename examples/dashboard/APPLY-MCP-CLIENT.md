MCP generated client adapter

Steps
- Generate MCP client in this repo:
  - MCP_BASE_URL=http://127.0.0.1:4319 ./scripts/generate-openapi-client-mcp.sh examples/dashboard/generated/mcp-client
- In the dashboard repo:
  - mkdir -p src/generated/mcp-client
  - cp -r ../system-setup-update/examples/dashboard/generated/mcp-client/* src/generated/mcp-client/
  - git apply ../system-setup-update/examples/dashboard/patches/mcp-adapter-template.patch
  - Set VITE_MCP_URL to the MCP/bridge base URL (e.g., http://localhost:4319 if directly, or your server proxy base)

Usage
- import { getMcpSelfStatus } from 'src/lib/mcpAdapter';
- const status = await getMcpSelfStatus();

Notes
- The adapter prefers the generated client (openapi-typescript-codegen or openapi-generator) and falls back to direct fetch.
- Align the import path to your project structure if it differs.

