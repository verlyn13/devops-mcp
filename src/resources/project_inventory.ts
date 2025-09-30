import { projectDiscover } from '../tools/project_discover.js';

export async function getProjectInventory() {
  const disc = await projectDiscover({});
  const items = disc.projects.map(p => ({ id: p.id, name: p.name, kind: p.kind }));
  return { count: items.length, items };
}

