import createClient from 'openapi-fetch';
import type { paths } from '../generated/types';

export function makeMcpClient(baseUrl?: string) {
  const base = (baseUrl
    || (typeof process !== 'undefined' ? process.env.MCP_URL : undefined)
    || (typeof (globalThis as any).importMeta !== 'undefined' ? (globalThis as any).importMeta.env?.VITE_MCP_URL : undefined)
    || (typeof (globalThis as any).import_meta !== 'undefined' ? (globalThis as any).import_meta.env?.VITE_MCP_URL : undefined)
    || (typeof (globalThis as any).importMeta !== 'undefined' ? (globalThis as any).importMeta.env?.VITE_MCP_BASE_URL : undefined)
    || 'http://127.0.0.1:4319').replace(/\/$/, '');

  return createClient<paths>({ baseUrl: base });
}

