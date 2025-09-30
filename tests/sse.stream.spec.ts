import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

describe('SSE stream (Bridge)', () => {
  it('streams events from log tail and respects simple filter', async () => {
    // Prepare temp config
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devops-mcp-sse-'));
    const cfgPath = path.join(tmp, 'config.toml');
    const cfg = [
      `[dashboard_bridge]`,
      `enabled = true`,
      `port = 7181`,
      `allowed_origins = []`,
      `allow_mutations = false`,
      ``,
      `[audit]`,
      `dir = "${tmp.replaceAll('\\\\','\\\\\\\\')}"`,
    ].join('\n');
    fs.writeFileSync(cfgPath, cfg);
    process.env.DEVOPS_MCP_CONFIG = cfgPath;

    // Start bridge
    const { startDashboardBridge } = await import('../src/http/shim.js');
    startDashboardBridge();

    // Determine log file and write a test event
    const { getTelemetryInfo } = await import('../src/lib/telemetry/info.js');
    const info = getTelemetryInfo();
    const logFile: string = info.logs?.localFile as string;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });

    const evt = {
      event: 'UnitTestEvent',
      run_id: 'run_test_1',
      tool: 'unit',
      profile: 'test',
      project_id: 'proj1',
      iso_time: new Date().toISOString(),
      time: Date.now(),
      service: 'devops-mcp'
    };
    fs.appendFileSync(logFile, JSON.stringify(evt) + '\n');

    // Connect SSE with a filter that matches our event
    const url = 'http://127.0.0.1:7181/api/events/stream?event=UnitTestEvent';
    const ac = new AbortController();
    const res = await fetch(url, { signal: ac.signal, headers: { accept: 'text/event-stream' } });
    expect(res.ok).toBe(true);

    const reader = res.body!.getReader();
    let buf = '';
    let got = false;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !got) {
      const { value, done } = await reader.read().catch(() => ({ done: true, value: null as any }));
      if (done) break;
      buf += new TextDecoder('utf-8').decode(value);
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const json = line.slice(6);
        try { const parsed = JSON.parse(json); if (parsed.event === 'UnitTestEvent') { got = true; break; } } catch {}
      }
      await sleep(50);
    }
    ac.abort();
    expect(got).toBe(true);
  }, 20000);
});

