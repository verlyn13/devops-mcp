import { getConfig } from '../config.js';

type Check = { name: string; ok: boolean; status?: number; error?: string };

export async function integrationCheck(opts?: { external?: boolean }) {
  const checks: Check[] = [];
  const cfg = getConfig();
  const external = opts?.external ?? true;
  if (external && cfg.dashboard_bridge?.enabled) {
    const base = `http://127.0.0.1:${cfg.dashboard_bridge.port || 0}`.replace(/:\/$/, ':0');
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    if (cfg.dashboard_bridge.token) headers.authorization = `Bearer ${cfg.dashboard_bridge.token}`;
    async function probe(name: string, path: string, init?: RequestInit) {
      try {
        const res = await fetch(base + path, { ...init, headers: { ...(init?.headers||{}), ...headers } });
        const ok = res.ok;
        checks.push({ name, ok, status: res.status, error: ok ? undefined : await res.text().catch(()=>undefined) });
      } catch (e) {
        checks.push({ name, ok: false, status: 0, error: String(e) });
      }
    }
    await probe('self-status', '/api/self-status');
    await probe('projects', '/api/projects');
    await probe('project_discover', '/api/tools/project_discover', { method: 'POST', body: '{}' });
    await probe('mcp_health', '/api/tools/mcp_health', { method: 'POST', body: '{}' });
  }
  // Internal probes
  try { const { getTelemetryInfo } = await import('../lib/telemetry/info.js'); const info = getTelemetryInfo(); if (info) checks.push({ name: 'telemetry_info', ok: true }); } catch (e) { checks.push({ name: 'telemetry_info', ok: false, error: String(e) }); }
  try { const { projectDiscover } = await import('./project_discover.js'); const d = await projectDiscover({}); checks.push({ name: 'project_discover_internal', ok: (d.count>=0) }); } catch (e) { checks.push({ name: 'project_discover_internal', ok: false, error: String(e) }); }
  const ok = checks.every(c => c.ok);
  return { ok, checks } as const;
}

