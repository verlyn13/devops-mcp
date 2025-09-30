import fs from 'node:fs';
import path from 'node:path';
import { projectDiscover } from '../tools/project_discover.js';

export async function getProjectManifest(projectId?: string) {
  const disc = await projectDiscover({});
  if (!projectId) return disc;
  const pr = disc.projects.find(p => p.id === projectId);
  if (!pr) return { error: 'not_found' } as const;
  const files: Record<string, boolean> = {};
  for (const rel of ['package.json','go.mod','mise.toml','pyproject.toml','sbom.json','bom.json']) {
    try { files[rel] = fs.existsSync(path.join(pr.root, rel)); } catch { files[rel] = false; }
  }
  return { project: pr, files };
}

