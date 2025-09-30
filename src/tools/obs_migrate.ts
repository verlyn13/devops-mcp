import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getConfig } from '../config.js';

export async function obsMigrate(opts?: { project_id?: string }) {
  const cfg = getConfig();
  const macBase = path.join((cfg.audit?.dir || path.join(os.homedir(), 'Library', 'Application Support', 'devops.mcp')), 'observations');
  const xdgBase = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'observations');
  const bases = [xdgBase, macBase];
  const results: any[] = [];
  for (const base of bases) {
    let projects: string[] = [];
    try {
      projects = fs
        .readdirSync(base)
        .filter((n) => {
          try { return fs.statSync(path.join(base, n)).isDirectory(); } catch { return false; }
        });
    } catch { continue; }
    if (opts?.project_id) projects = projects.filter((n) => n === opts.project_id);
    for (const idDir of projects) {
      const dir = path.join(base, idDir);
      const combined = path.join(dir, 'observations.ndjson');
      const parts = ((): string[] => { try { return fs.readdirSync(dir).filter(n => n.endsWith('.ndjson') && n !== 'observations.ndjson'); } catch { return []; } })();
      if (parts.length === 0) continue;
      try {
        const files = parts.map(n => path.join(dir, n));
        files.sort((a,b)=> { try { return (fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs); } catch { return 0; } });
        let out = '';
        for (const f of files) { try { out += fs.readFileSync(f, 'utf8'); if (!out.endsWith('\n')) out += '\n'; } catch {} }
        fs.writeFileSync(combined, out);
        results.push({ base, idDir, wrote: out.split('\n').filter(Boolean).length });
      } catch (e) {
        results.push({ base, idDir, error: String(e) });
      }
    }
  }
  return { ok: true, migrated: results } as const;
}
