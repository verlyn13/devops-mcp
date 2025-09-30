Contract Version: v1.1.0 (Stage 1 Freeze)

Scope
- OpenAPI: docs/openapi.yaml (info.version = 1.1.0)
- Schemas: service.discovery.v1.json, obs.integration.v1.json, obs.manifest.result.v1.json, obs.validate.result.v1.json, obs.migrate.result.v1.json, log_events.strict.schema.json ($id added), log_events.schema.json

Notes
- Timestamps in epoch ms (checkedAt, ts, nowMs)
- Service discovery: ds.self_status included
- Self-status: includes schema_version "obs.v1" and schemaVersion (compat)
- /api/obs/* aliases mirror primaries; /api/obs/discovery/openapi available

