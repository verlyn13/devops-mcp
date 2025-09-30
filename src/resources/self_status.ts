import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { getAuditInfo } from '../lib/audit.js';
import os from 'node:os';

function getConfigPath(): string {
  try { return process.env.DEVOPS_MCP_CONFIG ?? path.join(os.homedir(), '.config', 'devops-mcp', 'config.toml'); } catch { return ''; }
}

function getVersion(): string {
  try { const p = path.join(process.cwd(), 'package.json'); const txt = fs.readFileSync(p,'utf8'); return JSON.parse(txt).version || 'unknown'; } catch { return 'unknown'; }
}

export function getSelfStatus() {
  const cfg = getConfig();
  const cfgPath = getConfigPath();
  let configMtimeMs = 0;
  try { configMtimeMs = fs.statSync(cfgPath).mtimeMs; } catch {}
  let reachable = false; let lastError: string | undefined;
  try { const { getReachability } = require('../lib/telemetry/health.js'); const r = getReachability(); reachable = Boolean(r?.reachable); lastError = r?.lastError; } catch {}
  const audit = getAuditInfo();
  const caps = {
    logsMaxFileMB: Number(cfg.telemetry?.logs?.max_file_mb ?? 64),
    auditJsonlMaxMB: Number((cfg as any).audit?.jsonlMaxMB ?? 100),
    selfHistoryMax: Number((cfg as any).diagnostics?.self_history_max ?? 120),
  };
  const observers = {
    dirs: [
      path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'observations'),
      path.join((cfg.audit?.dir || path.join(os.homedir(), 'Library', 'Application Support', 'devops.mcp')), 'observations')
    ],
    registryPath: path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json')
  } as const;
  const auth = {
    bridgeTokenConfigured: Boolean((cfg as any).dashboard_bridge?.token),
    dsTokenPresent: Boolean(process.env.DS_TOKEN),
    corsAllowedOrigins: Array.isArray((cfg as any).dashboard_bridge?.allowed_origins) ? (cfg as any).dashboard_bridge?.allowed_origins : [],
  } as const;
  const nowMs = Date.now();
  // Contract identifiers
  let contractVersion = '1.0';
  try { const m = require('../lib/telemetry/contract.js'); contractVersion = String(m?.TELEMETRY_CONTRACT_VERSION || '1.0'); } catch {}
  const schemaVersion = '2025-09-01';
  const schema_version = 'obs.v1'; // Ground rule: obs.v1 for Stage 0+
  const ok = reachable;
  return {
    service: { name: 'devops-mcp', version: getVersion() },
    ok,
    contractVersion,
    schemaVersion,
    schema_version, // Added for orchestration alignment
    config: { path: cfgPath, mtimeMs: configMtimeMs },
    telemetry: { endpoint: cfg.telemetry.endpoint, protocol: cfg.telemetry.protocol, reachable, lastError },
    audit,
    caps,
    observers,
    auth,
    nowMs,
  } as const;
}

// In-memory rolling history
const __hist: { ts: number; snapshot: ReturnType<typeof getSelfStatus> }[] = [];
function maxHist() {
  try { const { getConfig } = require('../config.js'); const cfg = getConfig(); return Math.max(10, Number(cfg.diagnostics?.self_history_max ?? 120)); } catch { return 120; }
}

export function recordSelfStatus() {
  try {
    const snap = getSelfStatus();
    __hist.push({ ts: Date.now(), snapshot: snap });
    while (__hist.length > maxHist()) __hist.shift();
  } catch {}
}
export function getSelfStatusHistory(limit = 30) {
  const n = Math.max(1, Math.min(limit, maxHist()));
  return __hist.slice(-n);
}

export function summarizeSelfHistory(points: { ts: number; snapshot: ReturnType<typeof getSelfStatus> }[]) {
  const summary: Record<string, unknown> = {};
  const total = points.length;
  let up = 0; let down = 0; let lastErr: string | undefined;
  let lastUpTs = 0; let lastDownTs = 0;
  for (const p of points) {
    const r = p.snapshot?.telemetry?.reachable ? true : false;
    if (r) { up++; lastUpTs = p.ts; } else { down++; lastDownTs = p.ts; }
    const err = p.snapshot?.telemetry?.lastError;
    if (err) lastErr = err;
  }
  summary.total = total;
  summary.reachable = up;
  summary.unreachable = down;
  summary.uptimeRatio = total ? Number((up / total).toFixed(3)) : 0;
  if (lastUpTs) summary.lastReachableTs = lastUpTs;
  if (lastDownTs) summary.lastUnreachableTs = lastDownTs;
  if (lastErr) summary.lastError = lastErr;
  return summary;
}

export function recordSelfStatusNow() {
  const snap = getSelfStatus();
  __hist.push({ ts: Date.now(), snapshot: snap });
  while (__hist.length > maxHist()) __hist.shift();
  return snap;
}
