#!/usr/bin/env node
// Usage: PROJECT_ID=<id> node scripts/validate-manifest.mjs [baseUrl]
const base = (process.argv[2] || process.env.OBS_BRIDGE_URL || process.env.BRIDGE_URL || 'http://127.0.0.1:7171').replace(/\/$/, '');
const id = process.env.PROJECT_ID || process.argv[3];
if (!id) { console.error('PROJECT_ID env or argv[3] required'); process.exit(2); }
(async () => {
  try {
    const res = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/manifest`);
    if (!res.ok) {
      console.error('HTTP', res.status, await res.text().catch(()=>''));
      process.exit(1);
    }
    const j = await res.json();
    console.log(JSON.stringify(j, null, 2));
    process.exit(j.valid ? 0 : 1);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
