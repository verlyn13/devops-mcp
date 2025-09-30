#!/usr/bin/env node
// Validate /api/discovery/services against schema/service.discovery.v1.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const base = (process.argv[2] || process.env.OBS_BRIDGE_URL || process.env.BRIDGE_URL || 'http://127.0.0.1:7171').replace(/\/$/, '');
const projectId = process.env.PROJECT_ID || '';

async function main() {
  const url = `${base}/api/discovery/services`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('HTTP', res.status, await res.text().catch(()=>''));
    process.exit(1);
  }
  const body = await res.json();
  const schemaPath = path.resolve(__dirname, '../schema/service.discovery.v1.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(schema);
  const ok = validate(body);
  if (!ok) {
    console.error('Validation failed:', validate.errors);
    process.exit(2);
  }
  console.log('OK: services payload matches ServiceDiscovery schema');

  // Additional checks
  const ds = body?.ds || {};
  if (ds?.self_status) {
    try { const u = new URL(ds.self_status); if (!/^https?:$/.test(u.protocol)) throw new Error('bad_protocol'); }
    catch { console.error('Invalid ds.self_status URL:', ds.self_status); process.exit(2); }
  }
  // If DS_BASE_URL provided, assert discovery ds.self_status matches and DS self-status contract
  const DS_BASE_URL = (process.env.DS_BASE_URL || '').replace(/\/$/, '');
  const DS_TOKEN = process.env.DS_TOKEN || '';
  if (DS_BASE_URL) {
    const expected = `${DS_BASE_URL}/api/self-status`;
    if (ds?.self_status !== expected) {
      console.error('discovery.services.ds.self_status does not match expected', { got: ds?.self_status, expected });
      process.exit(2);
    }
    try {
      const headers = DS_TOKEN ? { authorization: `Bearer ${DS_TOKEN}` } : undefined;
      const r = await fetch(expected, { headers });
      if (!r.ok) { console.error('DS self-status HTTP', r.status); process.exit(2); }
      const j = await r.json();
      if (j?.schema_version !== 'ds.v1') { console.error('DS schema_version mismatch', j?.schema_version); process.exit(2); }
      if (typeof j?.nowMs !== 'number') { console.error('DS nowMs not numeric'); process.exit(2); }
      if (j?.service !== 'ds' && j?.service?.name !== 'ds') { console.error('DS service field mismatch'); process.exit(2); }
      console.log('OK: DS self-status contract');
    } catch (e) {
      console.error('DS self-status check failed', String(e));
      process.exit(2);
    }
  }

  // Aliases parity for discovery services
  try {
    const r2 = await fetch(`${base}/api/obs/discovery/services`);
    if (r2.ok) {
      const body2 = await r2.json();
      const keys1 = Object.keys(body || {}).sort().join(',');
      const keys2 = Object.keys(body2 || {}).sort().join(',');
      if (keys1 !== keys2) { console.error('Alias mismatch for discovery/services keys'); process.exit(2); }
      // Deep compare with normalization (ignore ts)
      const norm = (x) => { const c = JSON.parse(JSON.stringify(x||{})); delete c.ts; return c; };
      const a = JSON.stringify(norm(body));
      const b = JSON.stringify(norm(body2));
      if (a !== b) { console.error('Alias mismatch for discovery/services payload'); process.exit(2); }
    }
  } catch {}

  // Aliases parity for discovery schemas
  try {
    const a = await (await fetch(`${base}/api/discovery/schemas`)).json();
    const b = await (await fetch(`${base}/api/obs/discovery/schemas`)).json();
    const k1 = Object.keys(a || {}).sort().join(',');
    const k2 = Object.keys(b || {}).sort().join(',');
    if (k1 !== k2) { console.error('Alias mismatch for discovery/schemas keys'); process.exit(2); }
    // Deep compare (ignore loadedAt)
    const norm = (x) => { const c = JSON.parse(JSON.stringify(x||{})); delete c.loadedAt; return c; };
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) { console.error('Alias mismatch for discovery/schemas payload'); process.exit(2); }
  } catch {}

  if (projectId) {
    // Validate manifest
    const manUrl = `${base}/api/projects/${encodeURIComponent(projectId)}/manifest`;
    const manRes = await fetch(manUrl);
    if (!manRes.ok) { console.error('manifest HTTP', manRes.status); process.exit(1); }
    const man = await manRes.json();
    const manSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../schema/obs.manifest.result.v1.json'), 'utf8'));
    const v1 = ajv.compile(manSchema);
    if (!v1(man)) { console.error('Manifest validation failed:', v1.errors); process.exit(2); }
    // Validate integration
    const intUrl = `${base}/api/projects/${encodeURIComponent(projectId)}/integration`;
    const intRes = await fetch(intUrl);
    if (!intRes.ok) { console.error('integration HTTP', intRes.status); process.exit(1); }
    const integ = await intRes.json();
    const intSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../schema/obs.integration.v1.json'), 'utf8'));
    const v2 = ajv.compile(intSchema);
    if (!v2(integ)) { console.error('Integration validation failed:', v2.errors); process.exit(2); }
    console.log('OK: project manifest+integration match schemas');

    // Validate observers endpoints
    const linesSchema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../schema/obs.line.v1.json'), 'utf8'));
    const vLine = ajv.compile(linesSchema);
    const obsUrl = `${base}/api/obs/projects/${encodeURIComponent(projectId)}/observers`;
    const obsRes = await fetch(obsUrl);
    if (!obsRes.ok) { console.error('observers HTTP', obsRes.status); process.exit(1); }
    const obsBody = await obsRes.json();
    if (!Array.isArray(obsBody?.items) || obsBody.items.length === 0) { console.error('observers: empty items'); process.exit(2); }
    const all = obsBody.items;
    let bad = 0;
    for (const it of all) { if (!vLine(it)) bad++; }
    if (bad > 0) { console.error('observers: some items failed schema validation', bad); process.exit(2); }
    console.log('OK: observers items validate against ObserverLine schema');

    // Filtered observer subset check (git)
    const gitUrl = `${base}/api/obs/projects/${encodeURIComponent(projectId)}/observer/git`;
    const gitRes = await fetch(gitUrl);
    if (!gitRes.ok) { console.error('observer/git HTTP', gitRes.status); process.exit(1); }
    const gitBody = await gitRes.json();
    const gitItems = Array.isArray(gitBody?.items) ? gitBody.items : [];
    for (const it of gitItems) { if (it?.observer !== 'git') { console.error('observer/git: item with non-git observer'); process.exit(2); } }
    const key = (x) => JSON.stringify(x);
    const setAll = new Set(all.map(key));
    for (const it of gitItems) { if (!setAll.has(key(it))) { console.error('observer/git: item not subset of observers'); process.exit(2); } }
    console.log('OK: observer/git subset validated');

    // Aliases parity for project manifest and integration (normalize checkedAt)
    const manifestA = await (await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/manifest`)).json();
    const manifestB = await (await fetch(`${base}/api/obs/projects/${encodeURIComponent(projectId)}/manifest`)).json();
    const normMan = (x) => { const c = JSON.parse(JSON.stringify(x||{})); delete c.checkedAt; return c; };
    if (JSON.stringify(normMan(manifestA)) !== JSON.stringify(normMan(manifestB))) { console.error('Alias mismatch for project manifest'); process.exit(2); }
    const integA = await (await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/integration`)).json();
    const integB = await (await fetch(`${base}/api/obs/projects/${encodeURIComponent(projectId)}/integration`)).json();
    const normInt = (x) => { const c = JSON.parse(JSON.stringify(x||{})); delete c.checkedAt; return c; };
    if (JSON.stringify(normInt(integA)) !== JSON.stringify(normInt(integB))) { console.error('Alias mismatch for project integration'); process.exit(2); }
    console.log('OK: manifest/integration alias parity');

    // Schema serving alias parity for a sample name
    const names = (await (await fetch(`${base}/api/discovery/schemas`)).json()).names || [];
    const pick = names.find(Boolean) || 'obs.integration.v1.json';
    const sA = await (await fetch(`${base}/api/schemas/${encodeURIComponent(pick)}`)).json();
    const sB = await (await fetch(`${base}/api/obs/schemas/${encodeURIComponent(pick)}`)).json();
    if (JSON.stringify(sA) !== JSON.stringify(sB)) { console.error('Alias mismatch for schema content'); process.exit(2); }
    console.log('OK: schema alias parity');
  }
}

main().catch((e) => { console.error(String(e)); process.exit(3); });
