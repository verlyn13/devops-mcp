import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { childLogger } from '../lib/logging/logger.js';

export const ProjectDiscoverInput = z.object({
  maxDepth: z.number().min(0).max(4).default(2),
}).partial();
export type ProjectDiscoverInput = z.infer<typeof ProjectDiscoverInput>;

type Project = {
  id: string;
  name: string;
  root: string;
  kind: ('node'|'go'|'python'|'mix'|'generic');
  detectors: string[];
};

function hashId(p: string): string { return crypto.createHash('sha1').update(p).digest('hex').slice(0, 12); }

function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

function detectProject(root: string): Project | null {
  const detectors: string[] = [];
  let kind: Project['kind'] = 'generic';
  const f = (rel: string) => path.join(root, rel);
  const exists = (rel: string) => { try { return fs.existsSync(f(rel)); } catch { return false; } };
  if (exists('.git')) detectors.push('git');
  if (exists('package.json')) { detectors.push('node'); kind = 'node'; }
  if (exists('go.mod')) { detectors.push('go'); kind = detectors.includes('node') ? 'mix' : 'go'; }
  if (exists('pyproject.toml')) { detectors.push('python'); kind = (kind==='generic'?'python':'mix'); }
  if (exists('mise.toml')) detectors.push('mise');
  if (exists('sbom.json') || exists('bom.json')) detectors.push('sbom');
  if (detectors.length === 0) return null;
  const name = path.basename(root);
  return { id: hashId(root), name, root, kind, detectors };
}

function* walk(dir: string, maxDepth: number, depth = 0): Generator<string> {
  if (depth > maxDepth) return;
  let ents: fs.Dirent[] = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') && e.name !== '.git') continue;
    const child = path.join(dir, e.name);
    yield child;
    yield* walk(child, maxDepth, depth + 1);
  }
}

export async function projectDiscover(args?: ProjectDiscoverInput) {
  const cfg = getConfig();
  const maxDepth = args?.maxDepth ?? 2;
  const projects: Project[] = [];
  const log = childLogger({ tool: 'project_discover' });

  log.info({ workspaces: cfg.workspaces?.length ?? 0, maxDepth }, 'starting project discovery');

  for (const ws of (cfg.workspaces || [])) {
    const root = expandTilde(ws);
    if (!fs.existsSync(root)) {
      log.warn({ workspace: ws, expanded: root }, 'workspace does not exist');
      continue;
    }

    log.debug({ workspace: ws, expanded: root }, 'scanning workspace');
    let dirCount = 0;

    for (const dir of walk(root, maxDepth)) {
      dirCount++;
      const pr = detectProject(dir);
      if (pr) {
        log.debug({ project: pr.name, id: pr.id, kind: pr.kind }, 'found project');
        projects.push(pr);
      }
    }

    log.debug({ workspace: ws, directories_checked: dirCount, projects_found: projects.length }, 'workspace scan complete');
  }

  log.info({ discovered: projects.length }, 'project discovery completed');
  return { count: projects.length, projects };
}
