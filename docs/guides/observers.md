Observers Guide

Locations
- macOS: `~/Library/Application Support/devops.mcp/observations/<project_id>/`
- Linux (XDG): `~/.local/share/devops-mcp/observations/<project_id>/`

Files
- `observations.ndjson`: Combined event log (all observers); each line is a JSON object.
- `<observer>.ndjson`: Optional per-observer log; schema-compatible lines.

Schema
- Lines validate against `schema/obs.line.v1.json`.
- Required attributes include `event`, `time` (epoch ms), and tool or observer identifiers.

HTTP Access (Bridge)
- GET `/api/obs/projects/{id}/observers` → merged NDJSON JSON array
- GET `/api/obs/projects/{id}/observer/{type}` → single observer JSON array
- GET `/api/obs/validate` → sanity check for dirs and registry presence

Migration
- POST `/api/tools/obs_migrate` consolidates per-observer files into `observations.ndjson` safely.

Notes
- Keep lines small (<= 8KB) and append-only.
- Do not write secrets or PII; rely on policy and redaction.

