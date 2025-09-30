#!/usr/bin/env node
// Simple SSE client that prints events
const base = (process.argv[2] || process.env.OBS_BRIDGE_URL || process.env.BRIDGE_URL || 'http://127.0.0.1:7171').replace(/\/$/, '');
const url = `${base}/api/events/stream`;
console.error('[sse] connecting to', url);
const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
if (!res.ok || !res.body) { console.error('HTTP', res.status); process.exit(1); }
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split('\n\n');
  buf = parts.pop() || '';
  for (const chunk of parts) {
    const line = chunk.split('\n').find((l) => l.startsWith('data: '));
    if (line) {
      try { console.log(JSON.parse(line.slice(6))); }
      catch { console.log(line.slice(6)); }
    }
  }
}
