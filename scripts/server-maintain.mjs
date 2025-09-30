#!/usr/bin/env node
// One-shot maintenance runner: calls the Bridge tool endpoint and prints JSON
const endpoint = process.env.OBS_BRIDGE_URL || process.env.BRIDGE_URL || 'http://127.0.0.1:7171';
const token = process.env.BRIDGE_TOKEN || process.env.MCP_BRIDGE_TOKEN || process.env.DEVOPS_MCP_BRIDGE_TOKEN || '';

async function main() {
  const url = `${endpoint.replace(/\/$/,'')}/api/tools/server_maintain`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: '{}',
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));
  if (!res || !('ok' in res)) {
    console.error('Failed to contact bridge');
    process.exit(2);
  }
  if (!res.ok) {
    let body; try { body = await res.text(); } catch { body = '<no body>'; }
    console.error(`Upstream error status=${res.status} body=${body}`);
    process.exit(1);
  }
  const out = await res.json();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(String(e?.stack || e)); process.exit(2); });
