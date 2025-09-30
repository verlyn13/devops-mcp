#!/usr/bin/env node
import fs from 'node:fs';
import Ajv from 'ajv';

// SSE is served by the Bridge (dashboard_bridge)
const BASE = (process.env.OBS_BRIDGE_URL || process.env.BRIDGE_URL || 'http://127.0.0.1:7171').replace(/\/$/, '');
const args = process.argv.slice(2);
const params = new URLSearchParams();
let limit = 20;
let timeoutMs = 5000;
let requireHeartbeat = true;
let heartbeatMaxMs = 20000;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const [k, v] = a.split('=');
    const key = k.replace(/^--/, '');
    if (key === 'limit') limit = Number(v ?? args[++i] ?? limit) || limit;
    else if (key === 'timeoutMs') timeoutMs = Number(v ?? args[++i] ?? timeoutMs) || timeoutMs;
    else if (key === 'requireHeartbeat') requireHeartbeat = String(v ?? args[++i] ?? '1') !== '0';
    else if (key === 'heartbeatMaxMs') heartbeatMaxMs = Number(v ?? args[++i] ?? heartbeatMaxMs) || heartbeatMaxMs;
    else params.set(key, v ?? args[++i] ?? '');
  }
}

const schemaPath = new URL('../schema/obs.line.v1.json', import.meta.url);
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(schema);

const url = `${BASE}/api/events/stream?${params.toString()}`;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

let count = 0;
let invalid = 0;
let firstError = null;

const res = await fetch(url, { signal: controller.signal, headers: { accept: 'text/event-stream' } }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }));
if (!res || !res.ok) {
  console.error(`Failed to connect SSE: status=${res?.status}`);
  try { console.error(await res.text()); } catch {}
  process.exit(2);
}

const reader = res.body.getReader();
let buf = '';
let lastHeartbeat = 0;
while (true) {
  const { done, value } = await reader.read().catch(() => ({ done: true, value: null }));
  if (done) break;
  buf += new TextDecoder('utf-8').decode(value);
  let idx;
  while ((idx = buf.indexOf('\n\n')) !== -1) {
    const chunk = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    const lines = chunk.split('\n');
    const dataLine = lines.find(l => l.startsWith('data: '));
    const hbLine = lines.find(l => l.startsWith(':'));
    if (hbLine) lastHeartbeat = Date.now();
    if (!dataLine) continue;
    const json = dataLine.slice(6);
    let evt;
    try { evt = JSON.parse(json); } catch { continue; }
    const ok = validate(evt);
    if (!ok) { invalid++; if (!firstError) firstError = ajv.errorsText(validate.errors); }
    count++;
    if (count >= limit) { controller.abort(); break; }
  }
}
clearTimeout(timer);

if (invalid > 0) {
  console.error(`SSE validation: ${invalid}/${count} invalid. First error: ${firstError}`);
  process.exit(1);
}
if (count === 0 && requireHeartbeat) {
  console.error(`SSE validation: no events received. Last heartbeat at ${lastHeartbeat || 'none'}.`);
  process.exit(1);
}
console.log(`SSE validation: OK (${count} events)`);
