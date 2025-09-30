#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status || 1);
}

// 1) Lint
run('npx', ['--yes', '@stoplight/spectral-cli', 'lint', 'docs/openapi.yaml', '-r', 'spectral:oas']);

// 2) Bundle
fs.mkdirSync('build', { recursive: true });
run('npx', ['--yes', '@redocly/cli', 'bundle', 'docs/openapi.yaml', '--dereferenced', '-o', 'build/openapi.bundled.yaml']);

// 3) Types (preferred path)
run('npx', ['--yes', 'openapi-typescript', 'build/openapi.bundled.yaml', '-o', 'src/generated/types.d.ts']);

// 4) Optional axios SDK (if GENERATE_AXIOS=1)
if (process.env.GENERATE_AXIOS === '1') {
  run('npx', ['--yes', '@openapitools/openapi-generator-cli', 'generate', '-i', 'build/openapi.bundled.yaml', '-g', 'typescript-axios', '-o', 'src/generated/mcp-client', '--additional-properties=withSeparateModelsAndApi=true,modelPropertyNaming=original,enumPropertyNaming=original']);
}

console.log('gen-client complete');

