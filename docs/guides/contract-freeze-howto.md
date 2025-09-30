Contract Freeze (Stage 1) How-To

Purpose
- Freeze the API contract (OpenAPI + JSON Schemas) and enforce CI validation so contract drift is caught before merge.

Checklist (Agent D)
- Ensure Stage 0 is green (discovery, aliases, self-status, OpenAPI/schemas, validators).
- Align version markers:
  - Self-status includes schema_version: "obs.v1" (kept alongside schemaVersion).
  - OpenAPI info.version updated (e.g., v1.1.0) if agreed.
- Confirm typed examples use epoch ms for checkedAt/ts/nowMs.

Lint & Validate Locally
- OpenAPI lint:
  - npx @redocly/cli@latest lint docs/openapi.yaml
- Schema lint:
  - node scripts/schema-lint.mjs
- Endpoint validation:
  - node scripts/validate-endpoints.mjs
  - PROJECT_ID=<id> node scripts/validate-endpoints.mjs
  - Optional DS checks: DS_BASE_URL=... DS_TOKEN=... node scripts/validate-endpoints.mjs

Tagging
- Update OpenAPI version if needed: docs/openapi.yaml (info.version)
- Commit the change with message: "chore(contract): freeze v1.1.0"
- Create annotated tag: git tag -a v1.1.0 -m "Contract freeze v1.1.0 (obs.v1)"
- Push tag: git push origin v1.1.0

CI Gates
- Ensure workflows are present and required in PRs:
  - .github/workflows/validate-endpoints.yml (starts server, runs validators)
  - .github/workflows/openapi-lint.yml (Redocly)
  - .github/workflows/schema-lint.yml (schema $id and uniqueness checks)

Release Note
- Add/update docs/contracts/VERSION.md with the contract version and a brief summary of changes.

Roll-forward Plan
- Post-freeze, only backward-compatible patching to OpenAPI/schemas.
- Coordinate any breaking changes via a new minor version + migration notes.

