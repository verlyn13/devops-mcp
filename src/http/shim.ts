import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getTelemetryInfo } from '../lib/telemetry/info.js';
import { getConfig } from '../config.js';
import { logger } from '../lib/logging/logger.js';
import Ajv from 'ajv';
import * as fsPromises from 'node:fs/promises';
import yaml from 'js-yaml';

function readLastLines(file: string, maxLines: number): string[] {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const lines = data.trim().split('\n');
    return lines.slice(-maxLines);
  } catch { return []; }
}

type Rate = { tokens: number; last: number };
const buckets = new Map<string, Rate>();
function allow(ip: string, rps = 5): boolean {
  const now = Date.now();
  const rate = buckets.get(ip) || { tokens: rps, last: now };
  const refill = ((now - rate.last) / 1000) * rps;
  rate.tokens = Math.min(rps, rate.tokens + refill);
  rate.last = now;
  if (rate.tokens < 1) { buckets.set(ip, rate); return false; }
  rate.tokens -= 1; buckets.set(ip, rate); return true;
}

export function startDashboardBridge() {
  const cfg = getConfig();
  if (!cfg.dashboard_bridge?.enabled) return;
  const port = cfg.dashboard_bridge.port || 0;
  // Pre-compile manifest schema (prefer v1)
  const ajv = new Ajv({ allErrors: true, strict: false });
  let validateManifest: ((data: any) => boolean) | null = null;
  (async () => {
    try {
      const v1 = await fsPromises.readFile(new URL('../../schema/project.manifest.v1.json', import.meta.url), 'utf8').catch(() => null as any);
      const fb = await fsPromises.readFile(new URL('../../schema/project.manifest.schema.json', import.meta.url), 'utf8').catch(() => null as any);
      const raw = v1 || fb;
      if (raw) { const schema = JSON.parse(raw); validateManifest = ajv.compile(schema); }
    } catch {}
  })().catch(()=>{});
  const server = http.createServer(async (req, res) => {
    const ip = (req.socket.remoteAddress || 'unknown');
    if (!allow(ip)) { res.statusCode = 429; return res.end('rate_limited'); }
    const url = new URL(req.url || '/', 'http://localhost');
    // CORS
    const origin = req.headers.origin;
    if (process.env.BRIDGE_CORS === '1') {
      res.setHeader('access-control-allow-origin', origin || '*');
      res.setHeader('vary', 'origin');
    } else if (origin && cfg.dashboard_bridge.allowed_origins.length) {
      if (cfg.dashboard_bridge.allowed_origins.includes(origin)) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('vary', 'origin');
      }
    }
    if (req.method === 'OPTIONS') { res.setHeader('access-control-allow-methods','GET,OPTIONS'); res.setHeader('access-control-allow-headers','authorization,content-type'); res.statusCode=204; return res.end(); }
    // Auth (Bearer token)
    const auth = req.headers.authorization || '';
    const token = cfg.dashboard_bridge.token;
    if (token) {
      const ok = auth.startsWith('Bearer ') && auth.slice(7) === token;
      if (!ok) { res.statusCode = 401; return res.end('unauthorized'); }
    }
    // Small body reader for JSON POSTs (max ~1MB)
    const readJson = async <T=any>(): Promise<T | null> => {
      return await new Promise((resolve) => {
        if (req.method !== 'POST') return resolve(null);
        const ct = (req.headers['content-type']||'').toString();
        if (!ct.includes('application/json')) return resolve(null);
        let data = '';
        let tooBig = false;
        req.on('data', (chunk) => {
          data += chunk.toString('utf8'); if (data.length > 1_000_000) { tooBig = true; req.destroy(); }
        });
        req.on('end', () => {
          if (tooBig) return resolve(null);
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });
    };

    // Compatibility helpers (obs dirs + registry)
    const xdgObs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'observations');
    const macObs = path.join((cfg.audit?.dir || path.join(os.homedir(), 'Library', 'Application Support', 'devops.mcp')), 'observations');
    const obsBases = [xdgObs, macObs].filter(Boolean);
    const regPath = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
    function encodeId(id: string) { return id.replace(/[\/\\:]/g, '__'); }
    function readLines(file: string, limit = 1000): any[] {
      const out: any[] = [];
      try {
        const data = fs.readFileSync(file, 'utf8');
        const lines = data.split('\n');
        for (const l of lines) { const s = l.trim(); if (!s) continue; try { out.push(JSON.parse(s)); } catch {} }
      } catch {}
      return out.slice(-limit);
    }
    async function autoDiscoverIfNeeded() {
      if (process.env.BRIDGE_AUTO_DISCOVER === '0') return;
      try { const st = fs.statSync(regPath); if (st && st.size > 2) return; } catch {}
      try {
        const { projectDiscover } = await import('../tools/project_discover.js');
        const d = await projectDiscover({});
        try { fs.mkdirSync(path.dirname(regPath), { recursive: true }); } catch {}
        try { fs.writeFileSync(regPath, JSON.stringify({ count: d.count, projects: d.projects }, null, 2)); } catch {}
      } catch {}
    }

    if (url.pathname === '/api/telemetry-info') {
      const info = getTelemetryInfo();
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', `max-age=${info.cacheTtlSec || 60}`);
      if (info.etag) {
        res.setHeader('etag', info.etag);
        if (req.headers['if-none-match'] === info.etag) { res.statusCode = 304; return res.end(); }
      }
      res.end(JSON.stringify(info));
      return;
    }
    if (url.pathname === '/api/test/emit-event' && process.env.BRIDGE_TEST_ENDPOINTS === '1' && req.method === 'POST') {
      try {
        const body = await readJson<any>();
        const info = getTelemetryInfo();
        const file = info.logs?.localFile || '';
        if (!file) { res.statusCode = 500; return res.end('log_file_missing'); }
        const now = Date.now();
        const evt = {
          event: String(body?.event || 'TestEvent'),
          run_id: String(body?.run_id || `run_${now}`),
          tool: String(body?.tool || 'test'),
          profile: String(body?.profile || 'test'),
          project_id: String(body?.project_id || 'test'),
          iso_time: new Date(now).toISOString(),
          time: now,
          service: 'devops-mcp'
        };
        try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch {}
        fs.appendFileSync(file, JSON.stringify(evt) + '\n');
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ ok: true, appended: true, path: file }));
      } catch { res.statusCode = 500; res.end('emit_error'); }
      return;
    }
    if (url.pathname === '/api/mcp/self-status') {
      try {
        const { getSelfStatus } = await import('../resources/self_status.js');
        const out = getSelfStatus();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/.well-known/obs-bridge.json') {
      try {
        const body = {
          version: '1.1.0',
          schemaVersion: 'obs.v1',
          schema_version: 'obs.v1',
          defaults: {
            ports: { bridge: 7171, mcp: 4319, ds: 7777 },
            env: {
              bridge: ['OBS_BRIDGE_URL','BRIDGE_URL'],
              mcp: ['MCP_URL','MCP_BASE_URL'],
              ds: ['DS_BASE_URL']
            }
          },
          endpoints: {
            telemetry_info: '/api/telemetry-info',
            openapi: '/openapi.yaml',
            events_stream: '/api/events/stream',
            discovery_services: '/api/discovery/services',
            discovery_registry: '/api/discovery/registry',
            discovery_schemas: '/api/discovery/schemas',
            schemas: '/api/schemas/{name}',
            projects: '/api/projects',
            project: '/api/projects/{id}',
            project_manifest: '/api/projects/{id}/manifest',
            project_integration: '/api/projects/{id}/integration',
            observers_merged: '/api/obs/projects/{id}/observers',
            observer_filtered: '/api/obs/projects/{id}/observer/{type}',
            obs_validate: '/api/obs/validate',
            tools: {
              project_obs_run: '/api/tools/project_obs_run',
              obs_validate: '/api/tools/obs_validate',
              obs_migrate: '/api/tools/obs_migrate'
            }
          }
        };
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(body));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/discovery/services' || url.pathname === '/api/obs/discovery/services') {
      try {
        const sysReg = path.join(os.homedir(), '.config', 'system', 'registry.yaml');
        let reg: any = {};
        try { const txt = fs.readFileSync(sysReg, 'utf8'); reg = (yaml as any).load(txt) || {}; } catch {}
        const dsBase = process.env.DS_BASE_URL || reg?.ds?.url || '';
        const mcpBase = process.env.MCP_BASE_URL || reg?.mcp?.url || '';
        const services = {
          ds: dsBase ? {
            url: dsBase,
            well_known: dsBase.replace(/\/$/,'') + '/.well-known/obs-bridge.json',
            openapi: dsBase.replace(/\/$/,'') + '/openapi.yaml',
            capabilities: dsBase.replace(/\/$/,'') + '/v1/capabilities',
            health: dsBase.replace(/\/$/,'') + '/v1/health',
            self_status: dsBase.replace(/\/$/,'') + '/api/self-status'
          } : undefined,
          mcp: {
            url: mcpBase || `http://127.0.0.1:${port || 0}`,
            openapi: '/openapi.yaml',
            self_status: '/api/self-status'
          },
          registry: reg || {},
          ds_token_present: Boolean(process.env.DS_TOKEN),
          ts: Date.now()
        } as const;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(services));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/openapi.yaml' || url.pathname === '/api/discovery/openapi' || url.pathname === '/api/obs/discovery/openapi') {
      try {
        const p = new URL('../../docs/openapi.yaml', import.meta.url);
        const data = await fsPromises.readFile(p);
        const etag = 'W/"' + String(data.length) + '"';
        res.setHeader('etag', etag);
        if (req.headers['if-none-match'] === etag) { res.statusCode=304; return res.end(); }
        res.setHeader('content-type','application/yaml');
        res.end(data);
      } catch { res.statusCode=404; res.end('not_found'); }
      return;
    }
    if (url.pathname.startsWith('/api/schemas/') || url.pathname.startsWith('/api/obs/schemas/')) {
      const parts = url.pathname.split('/');
      const name = parts[parts.length-1] || '';
      const allow = new Set([
        'obs.line.v1.json',
        'project.manifest.schema.json',
        'project.manifest.v1.json',
        'obs.slobreach.v1.json',
        'obs.integration.v1.json',
        'obs.manifest.result.v1.json',
        'obs.validate.result.v1.json',
        'obs.migrate.result.v1.json',
        'service.discovery.v1.json'
      ]);
      if (!allow.has(name)) { res.statusCode=404; return res.end('not_found'); }
      try {
        const p = new URL('../../schema/'+name, import.meta.url);
        const data = await fsPromises.readFile(p);
        const etag = 'W/"' + String(data.length) + '"';
        res.setHeader('etag', etag);
        if (req.headers['if-none-match'] === etag) { res.statusCode=304; return res.end(); }
        res.setHeader('content-type','application/json');
        res.end(data);
      } catch { res.statusCode=404; res.end('not_found'); }
      return;
    }
    if (url.pathname === '/api/discovery/schemas' || url.pathname === '/api/obs/discovery/schemas') {
      try {
        const names = [
          'obs.line.v1.json',
          'project.manifest.schema.json',
          'project.manifest.v1.json',
          'obs.slobreach.v1.json',
          'obs.integration.v1.json',
          'obs.manifest.result.v1.json',
          'obs.validate.result.v1.json',
          'obs.migrate.result.v1.json',
          'service.discovery.v1.json'
        ];
        const schemas: any[] = [];
        const ids: string[] = [];
        let sizeSum = 0;
        for (const name of names) {
          try {
            const p = new URL('../../schema/'+name, import.meta.url);
            const data = await fsPromises.readFile(p, 'utf8');
            sizeSum += data.length;
            const j = JSON.parse(data);
            schemas.push(j);
            if (j && typeof j === 'object' && j.$id) ids.push(String(j.$id));
          } catch {}
        }
        const etag = 'W/"'+String(sizeSum)+'"';
        res.setHeader('etag', etag);
        if (req.headers['if-none-match'] === etag) { res.statusCode=304; return res.end(); }
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ schemas, names, ids, etag, loadedAt: Date.now() }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/obs/discovery/schemas') {
      // Alias to /api/discovery/schemas
      const redirect = '/api/discovery/schemas';
      try {
        const req2 = new Request(redirect);
      } catch {}
      res.statusCode = 302; res.setHeader('location', redirect); return res.end();
    }
    if (url.pathname.startsWith('/api/obs/schemas/')) {
      const name = url.pathname.split('/').pop() || '';
      const allow = new Set(['obs.line.v1.json','project.manifest.schema.json','project.manifest.v1.json','obs.slobreach.v1.json','obs.integration.v1.json','obs.manifest.result.v1.json']);
      if (!allow.has(name)) { res.statusCode=404; return res.end('not_found'); }
      try {
        const p = new URL('../../schema/'+name, import.meta.url);
        const data = await fsPromises.readFile(p);
        const etag = 'W/"' + String(data.length) + '"';
        res.setHeader('etag', etag);
        if (req.headers['if-none-match'] === etag) { res.statusCode=304; return res.end(); }
        res.setHeader('content-type','application/json');
        res.end(data);
      } catch { res.statusCode=404; res.end('not_found'); }
      return;
    }
    if (url.pathname === '/api/obs/well-known') {
      res.statusCode = 302; res.setHeader('location', '/.well-known/obs-bridge.json'); return res.end();
    }
    if (url.pathname === '/api/discovery/registry') {
      try {
        const regPath = new URL('../..', import.meta.url); // just to resolve base
      } catch {}
      const regPathFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
      try {
        const data = fs.readFileSync(regPathFs);
        const etag = 'W/"' + String(data.length) + '"';
        res.setHeader('etag', etag);
        if (req.headers['if-none-match'] === etag) { res.statusCode=304; return res.end(); }
        res.setHeader('content-type','application/json');
        res.end(data);
      } catch { res.statusCode=404; res.end('not_found'); }
      return;
    }
    if (url.pathname === '/api/self-status') {
      try {
        const { getSelfStatus } = await import('../resources/self_status.js');
        const out = getSelfStatus();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/self-status/now') {
      try {
        const { recordSelfStatusNow } = await import('../resources/self_status.js');
        const snap = recordSelfStatusNow();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(snap));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/self-status/history') {
      try {
        const { getSelfStatusHistory, summarizeSelfHistory } = await import('../resources/self_status.js');
        const limit = Math.max(1, Math.min(120, Number(url.searchParams.get('limit')||'60')));
        const points = getSelfStatusHistory(limit);
        const summary = summarizeSelfHistory(points);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ points, summary }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/tools/mcp_health' && req.method === 'POST') {
      try {
        const { mcpHealth } = await import('../tools/mcp_health.js');
        const out = mcpHealth();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/system_plan' && req.method === 'POST') {
      try {
        const body = await readJson<any>();
        const { SystemPlanInput, systemPlan } = await import('../tools/system_plan.js');
        const parsed = SystemPlanInput.safeParse(body||{});
        if (!parsed.success) { res.statusCode=400; return res.end('invalid_args'); }
        const out = await systemPlan(parsed.data);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/system_converge' && req.method === 'POST') {
      try {
        const body = await readJson<any>();
        const { SystemConvergeInput, systemConverge } = await import('../tools/system_converge.js');
        const parsed = SystemConvergeInput.safeParse(body||{});
        if (!parsed.success) { res.statusCode=400; return res.end('invalid_args'); }
        const wantsMutation = Boolean(parsed.data?.confirm);
        if (wantsMutation && !cfg.dashboard_bridge.allow_mutations) { res.statusCode=403; return res.end('mutations_disabled'); }
        const out = await systemConverge(parsed.data);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/project_discover' && req.method === 'POST') {
      try {
        const body = await readJson<any>();
        const { ProjectDiscoverInput, projectDiscover } = await import('../tools/project_discover.js');
        const parsed = ProjectDiscoverInput.safeParse(body||{});
        if (!parsed.success) { res.statusCode=400; return res.end('invalid_args'); }
        const out = await projectDiscover(parsed.data);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if ((url.pathname === '/api/tools/project_obs_run' || url.pathname === '/api/tool/project_obs_run') && req.method === 'POST') {
      try {
        const body = await readJson<any>();
        const { ProjectObsRunInput, projectObsRun } = await import('../tools/project_obs.js');
        const parsed = ProjectObsRunInput.safeParse(body||{});
        if (!parsed.success) { res.statusCode=400; return res.end('invalid_args'); }
        const out = await projectObsRun(parsed.data);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/server_maintain' && req.method === 'POST') {
      try {
        const { serverMaintain } = await import('../tools/server_maintain.js');
        const out = await serverMaintain();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/obs_migrate' && req.method === 'POST') {
      try {
        const { obsMigrate } = await import('../tools/obs_migrate.js');
        const body = await readJson<any>();
        const out = await obsMigrate({ project_id: body?.project_id });
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/obs_validate' && req.method === 'POST') {
      try {
        const { obsValidate } = await import('../tools/obs_validate.js');
        const out = await obsValidate();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/project_health' && req.method === 'POST') {
      try {
        const { projectHealth } = await import('../tools/project_obs.js');
        const out = await projectHealth();
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/patch_apply_check' && req.method === 'POST') {
      try {
        const body = await readJson<any>();
        const { PatchApplyInput, patchApplyCheck } = await import('../tools/patch_apply.js');
        const parsed = PatchApplyInput.safeParse(body||{});
        if (!parsed.success) { res.statusCode=400; return res.end('invalid_args'); }
        const out = await patchApplyCheck(parsed.data);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/tools/project_discover' && req.method === 'GET') {
      try {
        const { projectDiscover } = await import('../tools/project_discover.js');
        const out = await projectDiscover({});
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(out));
      } catch { res.statusCode=500; res.end('tool_error'); }
      return;
    }
    if (url.pathname === '/api/health') {
      const info = getTelemetryInfo();
      const body = { reachable: info.reachable, lastError: info.lastError, otlpEndpoint: info.endpoint, serviceVersion: info.service.version } as const;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
      return;
    }
    if (url.pathname === '/api/events') {
      const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit') || '100')));
      const since = Number(url.searchParams.get('since') || '0');
      const sel: Record<string,string> = {};
      for (const k of ['run_id','event','tool','profile','project_id']) { const v = url.searchParams.get(k); if (v) sel[k]=v; }
      const info = getTelemetryInfo();
      const lokiUrl = process.env.TELEMETRY_LOKI_URL;
      if (lokiUrl) {
        // Query last N log entries from Loki over last 5m with optional label filters
        const end = Date.now()*1e6; const start = end - 5*60*1e9; // ns
        const labels = ['service="devops-mcp"', ...Object.entries(sel).map(([k,v])=>`${k}="${v}"`)];
        const params = new URLSearchParams({ query: `{${labels.join(',')}}`, limit: String(limit), start: String(start), end: String(end) });
        fetch(`${lokiUrl.replace(/\/$/,'')}/loki/api/v1/query_range?${params.toString()}`).then(async r => {
          try {
            const j = await r.json() as any;
            const streams = j?.data?.result || [];
            const evs: any[] = [];
            for (const s of streams) { for (const v of (s.values||[])) { try { evs.push(JSON.parse(v[1])); } catch {} } }
            const filtered = evs.filter(e => {
              for (const [k,val] of Object.entries(sel)) { if ((e as any)[k] !== val) return false; }
              if (since) { const t = Number((e as any).time||0); if (!(t>since)) return false; }
              return true;
            });
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ events: filtered.slice(-limit), nextCursor: filtered.length ? String(Date.now()) : undefined }));
          } catch { res.statusCode=502; res.end(JSON.stringify({ error: 'loki_query_failed' })); }
        }).catch(() => { res.statusCode=502; res.end(JSON.stringify({ error: 'loki_unreachable' })); });
      } else {
        const file = info.logs?.localFile || '';
        const lines = file ? readLastLines(file, limit * 2) : [];
        const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter((e: any) => {
          for (const [k,val] of Object.entries(sel)) { if (e[k] !== val) return false; }
          return since ? (Number(e.time||0) > since) : true;
        }).slice(-limit);
        const nextCursor = events.length ? String(events[events.length-1].time || Date.now()) : undefined;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ events, nextCursor }));
      }
      return;
    }
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      try {
        await autoDiscoverIfNeeded();
        const { projectDiscover } = await import('../tools/project_discover.js');
        const q = (url.searchParams.get('q')||'').toLowerCase();
        const kind = url.searchParams.get('kind')||'';
        const detectorsQ = (url.searchParams.get('detectors')||'').toLowerCase();
        const detectors = detectorsQ ? detectorsQ.split(',').map(s=>s.trim()).filter(Boolean) : [];
        const sortKey = (url.searchParams.get('sort')||'name').toLowerCase();
        const order = (url.searchParams.get('order')||'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
        const page = Math.max(1, Number(url.searchParams.get('page')||'1'));
        const pageSize = Math.max(1, Math.min(200, Number(url.searchParams.get('pageSize')||'50')));
        const all = await projectDiscover({});
        let list = all.projects as any[];
        if (kind) list = list.filter((p: any) => p.kind === kind);
        if (detectors.length) list = list.filter((p: any) => detectors.every(d => (p.detectors||[]).map((x:string)=>x.toLowerCase()).includes(d)));
        if (q) list = list.filter((p: any) => p.name.toLowerCase().includes(q));
        list.sort((a: any, b: any) => {
          let cmp = 0;
          switch (sortKey) {
            case 'kind': cmp = (a.kind||'').localeCompare(b.kind||''); break;
            case 'id': cmp = (a.id||'').localeCompare(b.id||''); break;
            case 'detectors': cmp = (a.detectors?.length||0) - (b.detectors?.length||0); break;
            default: cmp = (a.name||'').localeCompare(b.name||''); break;
          }
          return order === 'desc' ? -cmp : cmp;
        });
        const total = list.length;
        const start = (page-1)*pageSize;
        const items = list.slice(start, start+pageSize).map((p: any) => ({ id: p.id, name: p.name, kind: p.kind }));
        try { logger().info({ event: 'ProjectsListed', total, page, pageSize, filters: { q, kind, detectors, sortKey, order } }, 'projects listed'); } catch {}
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ total, page, pageSize, items }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/obs/validate' && req.method === 'GET') {
      try {
        const info = getTelemetryInfo();
        const dirs: any[] = [];
        for (const base of obsBases) {
          const d: any = { path: base, exists: false, projects: 0, files: 0 };
          try {
            const st = fs.statSync(base); if (st.isDirectory()) { d.exists = true; const subs = fs.readdirSync(base); d.projects = subs.length; for (const s of subs) { try { const dd = fs.readdirSync(path.join(base, s)); d.files += dd.filter(n=>n.endsWith('.ndjson')).length; } catch {} } }
          } catch {}
          dirs.push(d);
        }
        let registryExists = false; try { const st = fs.statSync(regPath); registryExists = st.size > 2; } catch {}
        const body = { ok: dirs.some(d=>d.exists && d.files>0) || registryExists, telemetry: { reachable: info.reachable }, registry: { path: regPath, exists: registryExists }, dirs };
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify(body));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname.match(/^\/api\/obs\/projects\/[^/]+\/observers$/) && req.method === 'GET') {
      const pid = url.pathname.split('/')[4] || '';
      try {
        const id = encodeId(pid);
        let items: any[] = [];
        let files: string[] = [];
        for (const base of obsBases) {
          const dir = path.join(base, id);
          try {
            const combined = path.join(dir, 'observations.ndjson');
            if (fs.existsSync(combined)) {
              items = items.concat(readLines(combined, 2000));
              files.push(combined);
              continue;
            }
            const parts = fs.readdirSync(dir).filter(n => n.endsWith('.ndjson'));
            for (const n of parts) { const f = path.join(dir, n); files.push(f); items = items.concat(readLines(f, 1000)); }
          } catch {}
        }
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ project_id: pid, count: items.length, files, items }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname.match(/^\/api\/obs\/projects\/[^/]+\/observer\/[A-Za-z0-9_.-]+$/) && req.method === 'GET') {
      const parts = url.pathname.split('/');
      const pid = parts[4] || '';
      const observer = parts[6] || '';
      try {
        const id = encodeId(pid);
        let items: any[] = [];
        let files: string[] = [];
        for (const base of obsBases) {
          const dir = path.join(base, id);
          const f = path.join(dir, `${observer}.ndjson`);
          if (fs.existsSync(f)) { files.push(f); items = items.concat(readLines(f, 2000)); continue; }
          const combined = path.join(dir, 'observations.ndjson');
          if (fs.existsSync(combined)) {
            files.push(combined);
            const all = readLines(combined, 5000);
            items = items.concat(all.filter((x:any)=> x && x.observer === observer));
          }
        }
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ project_id: pid, observer, count: items.length, files, items }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/discover' && req.method === 'GET') {
      try {
        const { projectDiscover } = await import('../tools/project_discover.js');
        const d = await projectDiscover({});
        try { fs.mkdirSync(path.dirname(regPath), { recursive: true }); } catch {}
        try { fs.writeFileSync(regPath, JSON.stringify({ count: d.count, projects: d.projects }, null, 2)); } catch {}
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, count: d.count }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname.startsWith('/api/projects/') && req.method === 'GET') {
      const parts = url.pathname.split('/');
      const pid = parts[3] || '';
      try {
        const { getProjectManifest } = await import('../resources/project_manifest.js');
        const { getProjectStatus } = await import('../resources/project_status.js');
        const manifest = await getProjectManifest(pid);
        const obs = url.searchParams.get('observer') || undefined;
        const timeoutMs = Number(url.searchParams.get('timeoutMs')||'0') || undefined;
        const status = await getProjectStatus(pid, { observer: obs, timeoutMs });
        try { logger().info({ event: 'ProjectFetched', project_id: pid, ok: !(status as any).error }, 'project fetched'); } catch {}
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ manifest, status }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    // Alias: /api/obs/projects/:id/manifest → same as /api/projects/:id/manifest
    if (url.pathname.match(/^\/api\/obs\/projects\/[A-Za-z0-9_.-]+\/manifest$/) && req.method === 'GET') {
      // normalize to non-obs path handling by extracting id and running same logic
      const pid = url.pathname.split('/')[4] || '';
      try {
        let root = '';
        try {
          const regFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
          const reg = JSON.parse(fs.readFileSync(regFs, 'utf8'));
          const pr = (reg.projects||[]).find((p:any)=> p.id === pid);
          if (pr && pr.root) root = pr.root;
        } catch {}
        if (!root) {
          const { projectDiscover } = await import('../tools/project_discover.js');
          const d = await projectDiscover({});
          const pr = d.projects.find((p:any)=> p.id===pid); root = pr?.root || '';
        }
        if (!root) { res.statusCode=404; return res.end(JSON.stringify({ error: 'project_not_found' })); }
        const yml = path.join(root, 'project.manifest.yaml');
        let manifest: any = {};
        const checkedAt = Date.now();
        try {
          const txt = fs.readFileSync(yml, 'utf8');
          const yaml = await import('js-yaml');
          manifest = (yaml as any).load(txt);
        } catch { res.statusCode=404; return res.end(JSON.stringify({ error: 'manifest_not_found', path: yml })); }
        let valid = true; let errors: any[]|undefined;
        try { if (validateManifest) { valid = validateManifest(manifest) as boolean; errors = (validateManifest as any).errors || undefined; } } catch {}
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ path: yml, valid, errors, manifest, checkedAt }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname.match(/^\/api\/projects\/[A-Za-z0-9_.-]+\/manifest$/) && req.method === 'GET') {
      const pid = url.pathname.split('/')[3] || '';
      try {
        let root = '';
        try {
          const regFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
          const reg = JSON.parse(fs.readFileSync(regFs, 'utf8'));
          const pr = (reg.projects||[]).find((p:any)=> p.id === pid);
          if (pr && pr.root) root = pr.root;
        } catch {}
        if (!root) {
          const { projectDiscover } = await import('../tools/project_discover.js');
          const d = await projectDiscover({});
          const pr = d.projects.find((p:any)=> p.id===pid); root = pr?.root || '';
        }
        if (!root) { res.statusCode=404; return res.end(JSON.stringify({ error: 'project_not_found' })); }
        const yml = path.join(root, 'project.manifest.yaml');
        let manifest: any = {};
        const checkedAt = Date.now();
        try {
          const txt = fs.readFileSync(yml, 'utf8');
          const yaml = await import('js-yaml');
          manifest = (yaml as any).load(txt);
        } catch { res.statusCode=404; return res.end(JSON.stringify({ error: 'manifest_not_found', path: yml })); }
        let valid = true; let errors: any[]|undefined;
        try { if (validateManifest) { valid = validateManifest(manifest) as boolean; errors = (validateManifest as any).errors || undefined; } } catch {}
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ path: yml, valid, errors, manifest, checkedAt }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    // Alias: /api/obs/projects/:id/integration → same as /api/projects/:id/integration
    if (url.pathname.match(/^\/api\/obs\/projects\/[A-Za-z0-9_.-]+\/integration$/) && req.method === 'GET') {
      const pid = url.pathname.split('/')[4] || '';
      try {
        const sysReg = path.join(os.homedir(), '.config', 'system', 'registry.yaml');
        let reg: any = {};
        try { const txt = fs.readFileSync(sysReg, 'utf8'); reg = (yaml as any).load(txt) || {}; } catch {}
        const dsBase = (process.env.DS_BASE_URL || reg?.ds?.url || '').replace(/\/$/, '');
        const mcpBase = (process.env.MCP_BASE_URL || reg?.mcp?.url || `http://127.0.0.1:${port || 0}`).replace(/\/$/, '');
        const headers: Record<string,string> = {};
        if (process.env.DS_TOKEN) headers.authorization = `Bearer ${process.env.DS_TOKEN}`;
        let dsCaps: any = null; let dsHealth: any = null; let dsSelfStatus: any = null;
        if (dsBase) {
          try { const r = await fetch(`${dsBase}/v1/capabilities`, { headers }); if (r.ok) dsCaps = await r.json().catch(()=>null); } catch {}
          try { const r = await fetch(`${dsBase}/v1/health`, { headers }); if (r.ok) dsHealth = await r.json().catch(()=>null); } catch {}
          try { const r = await fetch(`${dsBase}/api/self-status`, { headers }); if (r.ok) dsSelfStatus = await r.json().catch(()=>null); } catch {}
        }
        const { getSelfStatus } = await import('../resources/self_status.js');
        const mcpSelf = getSelfStatus();
        let root = '';
        let detectors: string[] = [];
        try {
          const regFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
          const jr = JSON.parse(fs.readFileSync(regFs, 'utf8'));
          const pr = (jr.projects||[]).find((p:any)=> p.id === pid);
          if (pr) { root = pr.root || ''; detectors = pr.detectors || []; }
        } catch {}
        if (!root || detectors.length===0) {
          try { const { projectDiscover } = await import('../tools/project_discover.js'); const d = await projectDiscover({}); const pr = d.projects.find((p:any)=> p.id===pid); if (pr) { root = root || pr.root; detectors = detectors.length? detectors : (pr.detectors||[]); } } catch {}
        }
        let manifestPath = root ? path.join(root, 'project.manifest.yaml') : '';
        let manifestValid: boolean | null = null;
        try {
          const txt = fs.readFileSync(manifestPath, 'utf8');
          const data = (yaml as any).load(txt);
          if (validateManifest) { manifestValid = !!validateManifest(data); }
        } catch { manifestValid = null; }
        const regPathFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
        let registryPresent = false; try { const st = fs.statSync(regPathFs); registryPresent = st.size > 2; } catch {}
        let ready: string = '—';
        if ((detectors||[]).length > 0 && manifestValid === true) ready = 'ready';
        else if ((detectors||[]).length > 0 || manifestValid !== null) ready = 'partial';
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({
          schema_version: 'obs.v1',
          ds: { capabilities: dsCaps, health: dsHealth, self_status: dsSelfStatus },
          mcp: { self_status: mcpSelf },
          summary: { path: root || null, detectors, registryPath: regPathFs, registryPresent, manifestValid, ready },
          checkedAt: Date.now()
        }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname.match(/^\/api\/projects\/[A-Za-z0-9_.-]+\/integration$/) && req.method === 'GET') {
      const pid = url.pathname.split('/')[3] || '';
      try {
        // Determine DS/MCP base URLs
        const sysReg = path.join(os.homedir(), '.config', 'system', 'registry.yaml');
        let reg: any = {};
        try { const txt = fs.readFileSync(sysReg, 'utf8'); reg = (yaml as any).load(txt) || {}; } catch {}
        const dsBase = (process.env.DS_BASE_URL || reg?.ds?.url || '').replace(/\/$/, '');
        const mcpBase = (process.env.MCP_BASE_URL || reg?.mcp?.url || `http://127.0.0.1:${port || 0}`).replace(/\/$/, '');
        const headers: Record<string,string> = {};
        if (process.env.DS_TOKEN) headers.authorization = `Bearer ${process.env.DS_TOKEN}`;
        // Fetch DS capabilities and health (best-effort)
        let dsCaps: any = null; let dsHealth: any = null; let dsSelfStatus: any = null;
        if (dsBase) {
          try { const r = await fetch(`${dsBase}/v1/capabilities`, { headers }); if (r.ok) dsCaps = await r.json().catch(()=>null); } catch {}
          try { const r = await fetch(`${dsBase}/v1/health`, { headers }); if (r.ok) dsHealth = await r.json().catch(()=>null); } catch {}
          try { const r = await fetch(`${dsBase}/api/self-status`, { headers }); if (r.ok) dsSelfStatus = await r.json().catch(()=>null); } catch {}
        }
        // MCP self status directly from process
        const { getSelfStatus } = await import('../resources/self_status.js');
        const mcpSelf = getSelfStatus();
        // Typed summary fields
        // Get project root and detectors
        let root = '';
        let detectors: string[] = [];
        try {
          const regFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
          const jr = JSON.parse(fs.readFileSync(regFs, 'utf8'));
          const pr = (jr.projects||[]).find((p:any)=> p.id === pid);
          if (pr) { root = pr.root || ''; detectors = pr.detectors || []; }
        } catch {}
        if (!root || detectors.length===0) {
          try { const { projectDiscover } = await import('../tools/project_discover.js'); const d = await projectDiscover({}); const pr = d.projects.find((p:any)=> p.id===pid); if (pr) { root = root || pr.root; detectors = detectors.length? detectors : (pr.detectors||[]); } } catch {}
        }
        // Manifest validity quick check
        let manifestPath = root ? path.join(root, 'project.manifest.yaml') : '';
        let manifestValid: boolean | null = null;
        try {
          const txt = fs.readFileSync(manifestPath, 'utf8');
          const data = (yaml as any).load(txt);
          if (validateManifest) { manifestValid = !!validateManifest(data); }
        } catch { manifestValid = null; }
        const regPathFs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
        let registryPresent = false; try { const st = fs.statSync(regPathFs); registryPresent = st.size > 2; } catch {}
        let ready: string = '—';
        if ((detectors||[]).length > 0 && manifestValid === true) ready = 'ready';
        else if ((detectors||[]).length > 0 || manifestValid !== null) ready = 'partial';
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({
          schema_version: 'obs.v1',
          ds: { capabilities: dsCaps, health: dsHealth, self_status: dsSelfStatus },
          mcp: { self_status: mcpSelf },
          summary: { path: root || null, detectors, registryPath: regPathFs, registryPresent, manifestValid, ready },
          checkedAt: Date.now()
        }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/status$/) && req.method === 'GET') {
      // Alias to /api/projects/:id
      const pid = url.pathname.split('/')[3] || '';
      res.statusCode = 302; res.setHeader('location', `/api/projects/${pid}`); return res.end();
    }
    if (url.pathname.match(/^\/api\/obs\/projects\/[^/]+\/observers$/) && req.method === 'GET') {
      const pid = url.pathname.split('/')[4] || '';
      const enc = encodeId(pid);
      const all: any[] = [];
      for (const base of obsBases) {
        const dir = path.join(base, enc);
        try {
          // combined file if present
          const comb = path.join(dir, 'observations.ndjson');
          all.push(...readLines(comb, 2000));
          // per-observer files
          const ents = fs.readdirSync(dir).filter(n => n.endsWith('.ndjson') && n !== 'observations.ndjson');
          for (const name of ents) all.push(...readLines(path.join(dir, name), 2000));
        } catch {}
      }
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ items: all }));
      return;
    }
    if (url.pathname.match(/^\/api\/obs\/projects\/[^/]+\/observer\//) && req.method === 'GET') {
      const parts = url.pathname.split('/');
      const pid = parts[4] || '';
      const type = parts[6] || '';
      const enc = encodeId(pid);
      const out: any[] = [];
      for (const base of obsBases) {
        const dir = path.join(base, enc);
        try { out.push(...readLines(path.join(dir, `${type}.ndjson`), 2000)); } catch {}
        try {
          const comb = path.join(dir, 'observations.ndjson');
          const lines = readLines(comb, 2000);
          for (const e of lines) { if ((e.observer||e.type||'').toString().toLowerCase() === type.toLowerCase()) out.push(e); }
        } catch {}
      }
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ items: out }));
      return;
    }
    if (url.pathname.match(/^\/api\/projects\/[A-Za-z0-9]+\/health$/) && req.method === 'GET') {
      const parts = url.pathname.split('/');
      const pid = parts[3] || '';
      try {
        const { getProjectStatus } = await import('../resources/project_status.js');
        const st = await getProjectStatus(pid);
        const ok = !(st as any).error;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ ok, status: st }));
      } catch { res.statusCode=500; res.end('error'); }
      return;
    }
    if (url.pathname === '/api/events/stream') {
      const info = getTelemetryInfo();
      const lokiUrl = process.env.TELEMETRY_LOKI_URL;
      const sel: Record<string,string> = {};
      for (const k of ['run_id','event','tool','profile','project_id']) { const v = url.searchParams.get(k); if (v) sel[k]=v; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      // Backpressure-aware writer + heartbeat
      let paused = false;
      const write = (chunk: string) => {
        if (paused) return false;
        const ok = res.write(chunk);
        if (!ok) { paused = true; res.once('drain', () => { paused = false; }); }
        return ok;
      };
      const send = (e: any) => { if (!paused) write(`data: ${JSON.stringify(e)}\n\n`); };
      const HEARTBEAT_MS = 15000; const hb = setInterval(() => { if (!paused) write(`: keepalive ${Date.now()}\n\n`); }, HEARTBEAT_MS);
      if (lokiUrl) {
        let last = Date.now()*1e6 - 10*1e9; // 10s back in ns
        let intervalMs = 1000;
        let stopped = false;
        const loop = () => {
          if (stopped) return;
          const end = Date.now()*1e6; const start = last;
          const labels = ['service="devops-mcp"', ...Object.entries(sel).map(([k,v])=>`${k}="${v}"`)];
          const params = new URLSearchParams({ query: `{${labels.join(',')}}`, limit: '200', start: String(start), end: String(end)});
          fetch(`${lokiUrl.replace(/\/$/,'')}/loki/api/v1/query_range?${params.toString()}`).then(async r => {
            if (!r.ok) throw new Error(`loki_http_${r.status}`);
            const j = await r.json() as any;
            const streams = j?.data?.result || [];
            for (const s of streams) { for (const v of (s.values||[])) { try { const ev = JSON.parse(v[1]); let ok=true; for (const [k,val] of Object.entries(sel)) { if (ev[k]!==val) { ok=false; break; } } if (ok) send(ev); } catch {} } }
            last = end;
            intervalMs = paused ? Math.min(intervalMs * 2, 10000) : 1000; // back off if paused
          }).catch(() => { intervalMs = Math.min(intervalMs * 2, 10000); })
          .finally(() => { setTimeout(loop, intervalMs); });
        };
        loop();
        req.on('close', () => { stopped = true; clearInterval(hb); res.end(); });
      } else {
        const file = info.logs?.localFile || '';
        let lastSize = 0;
        const timer = setInterval(() => {
          try {
            const st = fs.statSync(file);
            if (st.size > lastSize) {
              const stream = fs.createReadStream(file, { start: lastSize, end: st.size });
              let buf = '';
              stream.on('data', (chunk) => { buf += chunk.toString('utf8'); });
              stream.on('end', () => {
              if (!paused) {
                for (const line of buf.split('\n')) {
                  if (!line.trim()) continue; try { const ev = JSON.parse(line); let ok=true; for (const [k,val] of Object.entries(sel)) { if (ev[k]!==val) { ok=false; break; } } if (ok) send(ev); } catch {}
                }
              }
            });
            lastSize = st.size;
          }
        } catch {}
      }, 1000);
      req.on('close', () => { clearInterval(timer); clearInterval(hb); res.end(); });
      }
      return;
    }

    // Note: Observer listing and filtering endpoints are implemented earlier
    // using NDJSON merge and type-specific filtering. Duplicate placeholder
    // endpoints and CI-only emit endpoint have been removed to avoid conflicts.

    if (url.pathname.startsWith('/api/runs/')) {
      const runId = url.pathname.split('/').pop() || '';
      if (!runId) { res.statusCode=400; return res.end('run_id_required'); }
      const lokiUrl = process.env.TELEMETRY_LOKI_URL;
      const info = getTelemetryInfo();
      const sinceMs = Number(url.searchParams.get('sinceMs')||'0');
      const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get('limit')||'500')));
      const events: any[] = [];
      if (lokiUrl) {
        const end = Date.now()*1e6; const start = (sinceMs? sinceMs : (Date.now()-24*3600_000))*1e6;
        const params = new URLSearchParams({ query: `{service="devops-mcp",run_id="${runId}"}`, limit: String(limit), start: String(start), end: String(end) });
        try { const r = await fetch(`${lokiUrl.replace(/\/$/,'')}/loki/api/v1/query_range?${params.toString()}`); const j = await r.json() as any; const streams = j?.data?.result || []; for (const s of streams) { for (const v of (s.values||[])) { try { events.push(JSON.parse(v[1])); } catch {} } } } catch {}
      } else {
        const file = info.logs?.localFile || '';
        try { const lines = readLastLines(file, limit*4); for (const l of lines) { try { const e = JSON.parse(l); if (e.run_id===runId) events.push(e); } catch {} } } catch {}
      }
      events.sort((a,b)=> (new Date(a.iso_time||0).getTime() - new Date(b.iso_time||0).getTime()));
      const startEv = events.find(e => e.event==='ConvergePlanned');
      const endEv = events.findLast ? events.findLast((e: any) => e.event==='ConvergeApplied' || e.event==='ConvergeAborted') : [...events].reverse().find((e: any)=> e.event==='ConvergeApplied'||e.event==='ConvergeAborted');
      const summary: any = { run_id: runId };
      if (startEv && endEv) summary.computedDurationMs = Math.max(0, new Date(endEv.iso_time).getTime() - new Date(startEv.iso_time).getTime());
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ summary, events: events.slice(-limit) }));
      return;
    }
    res.statusCode = 404; res.end('not found');
  });
  server.on('error', (err) => { try { process.stderr.write(`[bridge] http error: ${String((err as Error).message)}\n`); } catch {}; try { server.close(); } catch {}; setTimeout(startDashboardBridge, 2000); });
  server.on('close', () => { try { process.stderr.write(`[bridge] http closed; restarting...\n`); } catch {}; setTimeout(startDashboardBridge, 2000); });
  server.listen(port, () => { try { process.stderr.write(`[bridge] http listening on ${ (server.address() as any)?.port }\n`); } catch {} });
}
