#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const exts = new Set(['.md','.yaml','.yml','.js','.mjs','.ts','.tsx','.sh']);
const ignoreDirs = new Set(['node_modules','.git','.next','dist','build','.openapi-generator','src/generated']);
// Strict line-based rules: only flag env default assignments with wrong ports
const lineRules = [
  { name: 'MCP_BASE_URL default must be 4319', re: /\bMCP_BASE_URL\b\s*[:=]\s*['"]?http:\/\/127\.0\.0\.1:(?!4319)\d+/ },
  { name: 'MCP_URL default must be 4319', re: /\bMCP_URL\b\s*[:=]\s*['"]?http:\/\/127\.0\.0\.1:(?!4319)\d+/ },
  { name: 'OBS_BRIDGE_URL default must be 7171', re: /\bOBS_BRIDGE_URL\b\s*[:=]\s*['"]?http:\/\/127\.0\.0\.1:(?!7171)\d+/ },
  { name: 'BRIDGE_URL default must be 7171 (fallback only)', re: /\bBRIDGE_URL\b\s*[:=]\s*['"]?http:\/\/127\.0\.0\.1:(?!7171)\d+/ },
  { name: 'DS_BASE_URL default must be 7777', re: /\bDS_BASE_URL\b\s*[:=]\s*['"]?http:\/\/127\.0\.0\.1:(?!7777)\d+/ },
];
function* walk(dir){
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      if (entry.name === '.github' || entry.name === '.well-known') {
      } else if (ignoreDirs.has(entry.name)) {
        continue;
      }
    }
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else {
      const ext = path.extname(entry.name);
      if (exts.has(ext)) yield p;
    }
  }
}
let violations = [];
for (const file of walk(ROOT)) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of lineRules) {
      if (rule.re.test(line)) {
        violations.push({ file, rule: rule.name, snippet: line.trim(), line: idx + 1 });
      }
    }
  });
}
if (violations.length) {
  console.error('Convention violations found:');
  for (const v of violations) {
    console.error(`- ${v.rule}: ${v.file}:${v.line}`);
    console.error(`  ${v.snippet}`);
  }
  process.exit(1);
}
console.log('Conventions OK');
