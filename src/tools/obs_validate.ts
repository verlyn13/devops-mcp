import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getTelemetryInfo } from '../lib/telemetry/info.js';
import { getConfig } from '../config.js';

export async function obsValidate() {
  const cfg = getConfig();
  const info = getTelemetryInfo();
  const xdgObs = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'observations');
  const macObs = path.join((cfg.audit?.dir || path.join(os.homedir(), 'Library', 'Application Support', 'devops.mcp')), 'observations');
  const obsBases = [xdgObs, macObs];
  const regPath = path.join(os.homedir(), '.local', 'share', 'devops-mcp', 'project-registry.json');
  const dirs: any[] = [];
  let totalProjects = 0; let totalFiles = 0;
  for (const base of obsBases) {
    const d: any = { path: base, exists: false, projects: 0, files: 0 };
    try {
      const st = fs.statSync(base);
      if (st.isDirectory()) {
        d.exists = true;
        const subs = fs.readdirSync(base);
        d.projects = subs.length;
        for (const s of subs) {
          try {
            const dd = fs.readdirSync(path.join(base, s));
            d.files += dd.filter((n) => n.endsWith('.ndjson')).length;
          } catch {}
        }
        totalProjects += d.projects; totalFiles += d.files;
      }
    } catch {}
    dirs.push(d);
  }
  let registryExists = false;
  try {
    const st = fs.statSync(regPath);
    registryExists = st.size > 2;
  } catch {}
  const body = {
    ok: dirs.some((d) => d.exists && d.files > 0) || registryExists,
    telemetry: { reachable: info.reachable },
    registry: { path: regPath, exists: registryExists },
    dirs,
    counts: { totalProjects, totalFiles },
  } as const;
  return body;
}
