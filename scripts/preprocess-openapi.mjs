#!/usr/bin/env node
import fs from 'node:fs';
import yaml from 'js-yaml';

// Usage: node scripts/preprocess-openapi.mjs <in.yaml> <out.yaml>
const inPath = process.argv[2];
const outPath = process.argv[3] || inPath;
if (!inPath) {
  console.error('Usage: preprocess-openapi.mjs <in.yaml> <out.yaml>');
  process.exit(2);
}

const doc = yaml.load(fs.readFileSync(inPath, 'utf8'));

function transform(node) {
  if (!node || typeof node !== 'object') return;
  // Convert type: ['X','null'] to type: 'X' + nullable: true
  if (Array.isArray(node.type)) {
    const types = node.type.map(String);
    const nonNull = types.filter((t) => t !== 'null');
    if (types.includes('null') && nonNull.length === 1) {
      node.type = nonNull[0];
      if (node.nullable === undefined) node.nullable = true;
    }
  }
  // Recurse into known containers
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (val && typeof val === 'object') transform(val);
    if (Array.isArray(val)) val.forEach((v) => transform(v));
  }
}

// Walk components.schemas, paths.*.responses.*.content.*.schema, etc.
transform(doc);

// Downgrade to OpenAPI 3.0.3 for generator compatibility if needed
try {
  if (typeof doc.openapi === 'string' && doc.openapi.startsWith('3.1')) {
    doc.openapi = '3.0.3';
  }
} catch {}

fs.writeFileSync(outPath, yaml.dump(doc, { noRefs: true }));
console.log(`Preprocessed OpenAPI written: ${outPath}`);
