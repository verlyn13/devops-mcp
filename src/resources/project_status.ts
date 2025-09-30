import { safeExecFile } from '../lib/exec.js';
import { projectDiscover } from '../tools/project_discover.js';
import path from 'node:path';
import fs from 'node:fs';

type Observer = 'git' | 'mise' | 'build' | 'sbom' | 'manifest';

export async function getProjectStatus(projectId: string, opts?: { observer?: string | string[], timeoutMs?: number }) {
  const disc = await projectDiscover({});
  const pr = disc.projects.find(p => p.id === projectId);
  if (!pr) return { error: 'not_found' } as const;
  const root = pr.root;
  const status: Record<string, unknown> = { id: pr.id, name: pr.name, kind: pr.kind };
  const requested: Set<Observer> | null = (() => {
    const val = opts?.observer;
    if (!val) return null;
    const arr = Array.isArray(val) ? val : String(val).split(',');
    const normalized = arr.map(s => s.trim().toLowerCase()).filter(Boolean) as Observer[];
    if (!normalized.length) return null;
    return new Set<Observer>(normalized.filter((x): x is Observer => (['git','mise','build','sbom'] as const).includes(x as any)));
  })();
  const want = (x: Observer) => requested ? requested.has(x) : true;
  // Git
  const execRetry = async (cmd: string, args: string[], base: any) => {
    let last: any;
    const timeoutMs = Math.max(100, Math.min(5000, Number(opts?.timeoutMs || base?.timeoutMs || 3000)));
    for (let i=0;i<3;i++) {
      try { const r = await safeExecFile(cmd, args, { ...base, timeoutMs }); if (r.code === 0) return r; last = r; } catch (e) { last = e; }
      await new Promise(r => setTimeout(r, Math.min(500, 100 * (i+1))));
    }
    return last;
  };
  if (want('git')) {
    try {
      const br = await execRetry('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, timeoutMs: 3000 });
      const dirty = await execRetry('git', ['status', '--porcelain'], { cwd: root, timeoutMs: 3000 });
      status.git = { branch: br.code===0 ? br.stdout.trim() : undefined, dirty: (dirty.stdout||'').trim().length>0 };
    } catch {}
  }
  // Mise
  if (want('mise')) {
    try { status.mise = { exists: fs.existsSync(path.join(root, 'mise.toml')) }; } catch {}
  }
  // Build
  if (want('build')) {
    try {
      const pj = path.join(root, 'package.json');
      if (fs.existsSync(pj)) {
        const txt = fs.readFileSync(pj,'utf8');
        const j = JSON.parse(txt);
        status.build = { hasBuild: Boolean(j?.scripts?.build) };
      }
    } catch {}
  }
  // SBOM
  if (want('sbom')) {
    try { status.sbom = { exists: fs.existsSync(path.join(root,'sbom.json')) || fs.existsSync(path.join(root,'bom.json')) }; } catch {}
  }
  return { project: pr, status };
}
