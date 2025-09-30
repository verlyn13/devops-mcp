Contracts & Schemas

Endpoints
- Well-known: /.well-known/obs-bridge.json
- Telemetry info: /api/telemetry-info (includes openapi_url)
- OpenAPI: /openapi.yaml, /api/discovery/openapi
- Schemas: /api/schemas/{name}, list at /api/discovery/schemas (aliases under /api/obs/*)

Core Schemas
- obs.line.v1.json: NDJSON observation line
- obs.slobreach.v1.json: SLO breach observation
- project.manifest.v1.json: primary manifest schema (strict)
- project.manifest.schema.json: fallback manifest schema
- obs.integration.v1.json: typed integration response (includes summary, checkedAt)
- obs.manifest.result.v1.json: typed manifest validation result (includes checkedAt)
- obs.validate.result.v1.json: validation tool response
- obs.migrate.result.v1.json: migration tool response
- service.discovery.v1.json: service discovery contract (ts epoch ms)

Using Schemas
- Clients can GET /api/schemas/{name} with ETag caching.
- Dashboard can build links to the OpenAPI and schemas via telemetry-info and discovery endpoints.
 - Aliases for dashboard parity: /api/obs/discovery/schemas and /api/obs/schemas/{name}
