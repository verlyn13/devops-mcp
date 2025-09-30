# Stage 2: Typed Clients & Adapters

## Entrance Criteria (Stage 1 Complete)
- ✅ Contract freeze (OpenAPI v1.1.0)
- ✅ Schema versioning (obs.v1)
- ✅ CI validation gates operational

## Overview
Stage 2 focuses on generating typed TypeScript clients from OpenAPI specs and creating adapters for seamless integration between services.

## Agent D (MCP) Tasks

### 1. OpenAPI Accessibility
- [ ] Ensure `/openapi.yaml` is accessible via HTTP bridge
- [ ] Verify `/api/obs/discovery/openapi` returns valid spec
- [ ] Confirm CI validates endpoint availability

### 2. Alias Parity Maintenance
- [ ] All `/api/*` endpoints have `/api/obs/*` aliases
- [ ] Validate parity with automated tests
- [ ] Update OpenAPI documentation for new aliases

### 3. MCP Client Generation
- [ ] Generate TypeScript Axios client using `scripts/generate-openapi-client-mcp.sh`
- [ ] Place generated client in `src/generated/mcp-client/`
- [ ] Add client to `.gitignore` if regenerated frequently

### 4. Client Demo/Examples
- [ ] Create demo script showing client usage
- [ ] Document client initialization and authentication
- [ ] Provide examples for common operations

## Validation Steps

### Automated Validation
```bash
# 1. Verify OpenAPI accessibility
curl -I http://127.0.0.1:4319/openapi.yaml

# 2. Check alias parity
./scripts/validate-mcp-stage1.sh

# 3. Generate client
./scripts/generate-openapi-client-mcp.sh

# 4. Run type checks
pnpm check
```

### Manual Validation
- [ ] Review generated client types match OpenAPI spec
- [ ] Test client against live endpoints
- [ ] Verify error handling in client

## Acceptance Criteria
- [ ] OpenAPI spec accessible at standard endpoints
- [ ] All aliases maintain parity with base endpoints
- [ ] TypeScript client successfully generated
- [ ] Client demo/examples functional
- [ ] All validation tests pass

## Dependencies
- OpenAPI Generator CLI (`npm install -g @openapitools/openapi-generator-cli`)
- Axios for HTTP client
- TypeScript for type safety

## Notes
- Generated clients should be excluded from manual editing
- Regenerate clients when OpenAPI spec changes
- Consider versioning strategy for breaking changes