#!/usr/bin/env node
// Validate DS endpoints for ds.v1 contract
const base = (process.argv[2] || process.env.DS_BASE_URL || 'http://127.0.0.1:7777').replace(/\/$/, '');
const token = process.env.DS_TOKEN || '';
const headers = token ? { authorization: `Bearer ${token}` } : undefined;

async function mustJson(path) {
  const r = await fetch(base + path, { headers });
  if (!r.ok) throw new Error(`${path} http_${r.status}`);
  return r.json();
}

try {
  const self = await mustJson('/api/self-status');
  if (self?.schema_version !== 'ds.v1') throw new Error('self-status schema_version != ds.v1');
  if (typeof self?.nowMs !== 'number') throw new Error('self-status nowMs not number');
  const health = await mustJson('/v1/health');
  if (health?.schema_version && health.schema_version !== 'ds.v1') throw new Error('health schema_version != ds.v1');
  const caps = await mustJson('/v1/capabilities');
  if (caps?.schema_version && caps.schema_version !== 'ds.v1') throw new Error('capabilities schema_version != ds.v1');
  console.log('OK: DS ds.v1 contract validated');
} catch (e) {
  console.error('DS validation failed:', String(e));
  process.exit(2);
}

