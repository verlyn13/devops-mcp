import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { projectDiscover } from './project_discover.js';
import { safeExecFile } from '../lib/exec.js';

export async function runExternalObserver(project_id: string, observer: 'git'|'mise'|'build'|'sbom'|'manifest') {
  const cfg = getConfig();
  const disc = await projectDiscover({});
  const pr = disc.projects.find(p => p.id === project_id);
  if (!pr) return { ok: false, error: 'project_not_found' } as const;
  const dir = cfg.observers?.dir;
  if (!dir) return { ok: false, error: 'observer_dir_not_configured' } as const;
  const script = path.join(dir, `${observer}-observer.sh`);
  try { const st = fs.statSync(script); if (!st.isFile()) return { ok: false, error: 'observer_not_found' } as const; } catch { return { ok: false, error: 'observer_not_found' } as const; }
  const outDir = cfg.observers?.out_dir || path.join(cfg.audit?.dir || path.join(process.env.HOME || '', '.local'), 'observations');
  const projOutDir = path.join(outDir, project_id);
  try { fs.mkdirSync(projOutDir, { recursive: true }); } catch {}
  const outFile = path.join(projOutDir, `${observer}.ndjson`);
  // Rotate if too big
  try {
    const capMB = Math.max(8, Number(cfg.telemetry?.logs?.max_file_mb ?? 64));
    const capBytes = capMB * 1024 * 1024;
    try {
      const st = fs.statSync(outFile);
      if (st.size > capBytes) {
        const d = new Date();
        const ts = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
        const rotated = path.join(projOutDir, `${observer}-${ts}.ndjson`);
        try { fs.renameSync(outFile, rotated); } catch {}
      }
    } catch {}
  } catch {}
  const tmo = Math.max(1000, Number(cfg.observers?.timeout_ms || 5000));
  const res = await safeExecFile(script, [pr.root], { cwd: pr.root, timeoutMs: tmo });
  if (res.code !== 0) return { ok: false, error: 'observer_exec_failed', code: res.code, stderr: res.stderr } as const;
  // Normalize to NDJSON lines; if pretty JSON, try to condense
  const lines: string[] = [];
  for (const raw of res.stdout.split('\n')) {
    const s = raw.trim();
    if (!s) continue;
    try {
      const j = JSON.parse(s);
      lines.push(JSON.stringify(j));
    } catch {
      // Not pure JSON on this line; skip
    }
  }
  if (!lines.length) return { ok: false, error: 'no_observations' } as const;
  try { fs.appendFileSync(outFile, lines.map(l=>l+'\n').join(''), 'utf8'); } catch {}
  try { const last = JSON.parse(lines[lines.length-1]); fs.writeFileSync(path.join(projOutDir, 'latest.json'), JSON.stringify(last, null, 2)); } catch {}
  return { ok: true, wrote: lines.length, file: outFile } as const;
}
