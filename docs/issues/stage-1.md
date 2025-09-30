Stage 1 — Contract Freeze & CI Gates (Agent D: MCP)

Objectives
- Freeze OpenAPI + JSON Schemas; align version markers; enforce CI validation on PRs.

Tasks (Agent D)
- [ ] Confirm self-status includes schema_version: "obs.v1" and nowMs (epoch)
- [ ] Confirm discovery/services ds.self_status and ts:number
- [ ] OpenAPI examples use epoch ms (checkedAt/ts)
- [ ] Update OpenAPI info.version (e.g., v1.1.0) if agreed across repos
- [ ] Add/verify CI jobs: openapi-lint, schema-lint, validate-endpoints
- [ ] Add docs/contracts/VERSION.md with v1.1.0

Validation
- [ ] npx @redocly/cli@latest lint docs/openapi.yaml (attach log)
- [ ] node scripts/schema-lint.mjs (attach log)
- [ ] node scripts/validate-endpoints.mjs (attach log)
- [ ] PROJECT_ID=<id> node scripts/validate-endpoints.mjs (attach log)

Links
- Contract Freeze How-To: docs/guides/contract-freeze-howto.md
- Stage Epic: <!-- link epic -->
- DS Stage 1 Tracker: <!-- link -->
- Dashboard Stage 1 Tracker: <!-- link -->

