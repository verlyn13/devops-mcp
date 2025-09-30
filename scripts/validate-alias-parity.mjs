#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

/**
 * Stage 2 alias parity validator for MCP bridge OpenAPI.
 *
 * Focuses on ensuring base discovery endpoints under /api/* have
 * documented aliases under /api/obs/*, and that self-status is
 * documented at /api/self-status (in addition to /api/mcp/self-status).
 *
 * Exit codes:
 *  - 0: all checks passed
 *  - 1: one or more checks failed; details printed to stderr
 */

const PROJECT_ROOT = path.resolve(path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..'));
const OPENAPI_PATH = process.env.OPENAPI_PATH || path.join(PROJECT_ROOT, 'docs', 'openapi.yaml');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function loadOpenApi(p) {
  const text = fs.readFileSync(p, 'utf8');
  const doc = yaml.load(text);
  if (!doc || typeof doc !== 'object' || !doc.paths) {
    throw new Error('Invalid OpenAPI: missing paths');
  }
  return doc;
}

function hasPath(doc, p) {
  return Object.prototype.hasOwnProperty.call(doc.paths, p);
}

try {
  const openapi = loadOpenApi(OPENAPI_PATH);

  // 1) Discovery endpoints alias parity
  const discoveryPairs = [
    ['/api/discovery/services', '/api/obs/discovery/services'],
    ['/api/discovery/schemas', '/api/obs/discovery/schemas'],
    // OpenAPI discovery may be served but not always documented; Stage 2 expects alias accessible.
    ['/api/discovery/openapi', '/api/obs/discovery/openapi'],
  ];

  let parityOk = true;
  for (const [base, alias] of discoveryPairs) {
    const baseDoc = hasPath(openapi, base);
    const aliasDoc = hasPath(openapi, alias);
    if (!baseDoc) {
      fail(`Missing base discovery path in OpenAPI: ${base}`);
      parityOk = false;
    } else {
      pass(`Base discovery path documented: ${base}`);
    }
    if (!aliasDoc) {
      fail(`Missing alias discovery path in OpenAPI: ${alias}`);
      parityOk = false;
    } else {
      pass(`Alias discovery path documented: ${alias}`);
    }
  }

  // 2) Self-status should be available at /api/self-status in addition to /api/mcp/self-status
  const selfStatusBase = '/api/self-status';
  const selfStatusMcp = '/api/mcp/self-status';
  const hasBaseSelf = hasPath(openapi, selfStatusBase);
  const hasMcpSelf = hasPath(openapi, selfStatusMcp);

  if (!hasMcpSelf) {
    fail(`Missing MCP self-status path in OpenAPI: ${selfStatusMcp}`);
  } else {
    pass(`MCP self-status path documented: ${selfStatusMcp}`);
  }
  if (!hasBaseSelf) {
    fail(`Missing base self-status path in OpenAPI: ${selfStatusBase}`);
  } else {
    pass(`Base self-status path documented: ${selfStatusBase}`);
  }

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  } else {
    console.log('All parity checks passed.');
  }
} catch (err) {
  console.error(`Error: ${(err && err.message) || err}`);
  process.exit(1);
}

