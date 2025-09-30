MCP TypeScript Client (generated)

This folder contains a generated TypeScript axios client for the MCP bridge API, produced via:

  npx openapi-typescript-codegen --input ../../../../docs/openapi.yaml --output . --client axios --useOptions --name MCPClient

Usage examples

Option A: openapi-typescript-codegen style
- import { MCPClient } from './MCPClient';
- const client = new MCPClient({ baseUrl: import.meta.env.VITE_MCP_URL });
- const res = await client.request({ method: 'GET', url: '/api/self-status' });

Option B: openapi-generator (typescript-axios) style
- import { DefaultApi, Configuration } from './';
- const api = new DefaultApi(new Configuration({ basePath: import.meta.env.VITE_MCP_URL }));
- const { data } = await api.apiMcpSelfStatusGet();

Notes
- Set VITE_MCP_URL in your dashboard environment.
- This client is generated from docs/openapi.yaml; keep it in sync by re-running the generator.

