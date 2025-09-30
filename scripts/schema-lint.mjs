#!/usr/bin/env node
// Lint JSON Schemas: parse, ensure $id uniqueness, basic shape sanity
import fs from 'node:fs';
import path from 'node:path';

const schemaDir = path.resolve(process.cwd(), 'schema');
const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.json'));
const ids = new Map();
let errors = 0;
for (const f of files) {
  const p = path.join(schemaDir, f);
  try {
    const txt = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(txt);
    const id = j['$id'];
    if (!id) { console.error(`[schema-lint] missing $id: ${f}`); errors++; continue; }
    if (ids.has(id)) { console.error(`[schema-lint] duplicate $id: ${id} (${ids.get(id)} and ${f})`); errors++; }
    else ids.set(id, f);
    // minimal sanity: type presence
    if (!j['$schema'] || !j['type']) { console.error(`[schema-lint] missing $schema/type: ${f}`); errors++; }
  } catch (e) {
    console.error(`[schema-lint] parse error in ${f}:`, String(e));
    errors++;
  }
}
if (errors) { process.exit(2); }
console.log(`[schema-lint] OK (${files.length} files)`);

