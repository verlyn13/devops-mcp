import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { checkpointAudit, retain } from '../lib/audit.js';

export async function serverMaintain() {
  const out: Record<string, unknown> = { ok: true };
  try { checkpointAudit(); out.audit_checkpoint = true; } catch { out.audit_checkpoint = false; out.ok = false; }
  try { retain(getConfig().audit?.retainDays ?? 30); out.audit_retain = true; } catch { out.audit_retain = false; out.ok = false; }
  try {
    const cfg = getConfig();
    const days = cfg.system_repo?.cache_days ?? 14;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pruneRepoCache } = require('../lib/git.js');
    pruneRepoCache(days); out.repo_cache_pruned = true;
  } catch { out.repo_cache_pruned = false; out.ok = false; }
  // Rotate JSONL audit fallback if too large and prune older rotated files by retention
  try {
    const cfg = getConfig();
    const dir = cfg.audit?.dir || '';
    if (dir) {
      const file = path.join(dir, 'audit.jsonl');
      let st: fs.Stats | null = null;
      try { st = fs.statSync(file); } catch { st = null; }
      const capMB = Math.max(10, Number(cfg.audit?.jsonlMaxMB ?? 100));
      const capBytes = capMB * 1024 * 1024;
      if (st && st.size > capBytes) {
        const d = new Date();
        const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}_${String(x.getHours()).padStart(2,'0')}${String(x.getMinutes()).padStart(2,'0')}${String(x.getSeconds()).padStart(2,'0')}`;
        const rotated = path.join(dir, `audit-${fmt(d)}.jsonl`);
        try { fs.renameSync(file, rotated); } catch {}
        try { fs.writeFileSync(file, ''); } catch {}
      }
      // Prune rotated files older than retention days
      const keepMs = (cfg.audit?.retainDays ?? 30) * 86400_000;
      try {
        const entries = fs.readdirSync(dir).filter(n => n.startsWith('audit-') && n.endsWith('.jsonl'));
        const now = Date.now();
        for (const name of entries) {
          const p = path.join(dir, name);
          try { const s = fs.statSync(p); if ((now - s.mtimeMs) > keepMs) fs.unlinkSync(p); } catch {}
        }
      } catch {}
    }
    out.audit_jsonl_rotated = true;
  } catch { out.audit_jsonl_rotated = false; /* do not mark fail */ }
  return out;
}
