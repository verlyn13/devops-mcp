Client Generation Guide

Goal
- Generate TypeScript axios clients from OpenAPI and use them in the dashboard/server.

Bridge client (axios)
- Run: ./scripts/generate-openapi-client.sh [BRIDGE_URL] [OUT_DIR]
- Defaults: BRIDGE_URL=http://127.0.0.1:7171, OUT_DIR=examples/dashboard/generated/bridge-client
- Tries openapi-typescript-codegen first; falls back to @openapitools/openapi-generator-cli; then docker fallback.

DS client (axios)
- Run: DS_BASE_URL=http://127.0.0.1:7777 ./scripts/generate-openapi-client-ds.sh examples/dashboard/generated/ds-client
- Same tool fallback chain as bridge.

MCP client (preferred: 3.1-native types + fetch)
- Lint and bundle first (one-time or in CI):
  - `pnpm run oas:lint && pnpm run oas:bundle`
- Generate types (3.1-native):
  - `pnpm run gen:types`
- Use with `openapi-fetch` via `src/lib/mcpFetchClient.ts`:
  - `import { makeMcpClient } from 'src/lib/mcpFetchClient'`
  - `const api = makeMcpClient(import.meta.env.VITE_MCP_URL)`

MCP client (optional axios SDK)
- If a consumer requires axios, after bundling you can run:
  - `pnpm run gen:client:axios`

Troubleshooting
- Run the standard pipeline: `pnpm run oas:lint && pnpm run oas:bundle && pnpm run gen:types`
- Use the bundled spec (`build/openapi.bundled.yaml`) as the only generator input.
- For axios SDKs, feed the bundled spec to `openapi-generator-cli`.

Usage snippet (dashboard server)
- import { DefaultApi, Configuration } from 'src/generated/mcp-client';
- const api = new DefaultApi(new Configuration({ basePath: process.env.VITE_MCP_URL || import.meta.env.VITE_MCP_URL }));
- const { data } = await api.apiMcpSelfStatusGet();

Integration Notes
- The dashboard uses OBS_BRIDGE_URL; point the generated client base URL to that value.
- Adapter patches under examples/dashboard/patches show how to prefer the generated client and fallback to existing fetch helpers.
- If your CI needs artifacts, run the scripts during build and commit/copy the generated clients into src/generated/*.
