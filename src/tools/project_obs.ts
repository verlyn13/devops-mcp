import { z } from 'zod';
import { getProjectStatus } from '../resources/project_status.js';
import { runExternalObserver } from './observer_runner.js';
import { projectDiscover } from './project_discover.js';
import { childLogger } from '../lib/logging/logger.js';

export const ProjectObsRunInput = z.object({ project_id: z.string(), observer: z.enum(['git','mise','build','sbom','manifest']).optional() });
export type ProjectObsRunInput = z.infer<typeof ProjectObsRunInput>;

export async function projectObsRun(args: ProjectObsRunInput) {
  const log = childLogger({ tool: 'project_obs_run', project_id: args.project_id, observer: args.observer });
  log.info({ project_id: args.project_id, observer: args.observer }, 'starting project observers');
  const res = await getProjectStatus(args.project_id, { observer: args.observer });
  const results: any = {};
  if (args.observer) {
    try { results[args.observer] = await runExternalObserver(args.project_id, args.observer); }
    catch (e) { results[args.observer] = { ok: false, error: 'external_observer_error', message: String(e) }; }
  } else {
    const defaults: ('git'|'mise'|'build'|'sbom'|'manifest')[] = ['git','mise','build','sbom','manifest'];
    for (const ob of defaults) {
      try { results[ob] = await runExternalObserver(args.project_id, ob); }
      catch (e) { results[ob] = { ok: false, error: 'external_observer_error', message: String(e) }; }
    }
  }
  (res as any).external = results;
  const ok = !('error' in res);
  log.info({ project_id: args.project_id, observer: args.observer, ok }, 'finished project observers');
  return { ok, observer: args.observer, detail: res };
}

export async function projectHealth() {
  const disc = await projectDiscover({});
  const log = childLogger({ tool: 'project_health' });
  const kinds = Object.fromEntries(Object.entries(disc.projects.reduce((acc: Record<string,number>, p) => { acc[p.kind]=(acc[p.kind]||0)+1; return acc; }, {})));
  log.info({ projects: disc.count }, 'project health summary');
  return { projects: disc.count, kinds };
}
