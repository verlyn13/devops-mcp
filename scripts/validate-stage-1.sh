#!/bin/bash
set -euo pipefail

# Stage 1 Validation Script for DevOps MCP
# Validates all Stage 1 requirements are met

echo "========================================="
echo "Stage 1 Validation for DevOps MCP (Agent D)"
echo "========================================="
echo

# Configuration
MCP_URL="http://127.0.0.1:4319"
BEARER_TOKEN="${MCP_BRIDGE_TOKEN:-devops-mcp-bridge-token-2024}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Track validation results
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_TESTS=0

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS_COUNT++))
    ((TOTAL_TESTS++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL_COUNT++))
    ((TOTAL_TESTS++))
}

check_response() {
    local endpoint="$1"
    local expected_status="${2:-200}"
    local description="$3"

    response=$(curl -s -m 5 -w "\n%{http_code}" -H "Authorization: Bearer $BEARER_TOKEN" "$MCP_URL$endpoint" 2>/dev/null || echo "000")
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" = "$expected_status" ]; then
        pass "$description"
        return 0
    else
        fail "$description (got $status_code, expected $expected_status)"
        return 1
    fi
}

check_json_field() {
    local endpoint="$1"
    local field="$2"
    local expected="$3"
    local description="$4"

    response=$(curl -s -m 5 -H "Authorization: Bearer $BEARER_TOKEN" "$MCP_URL$endpoint" 2>/dev/null)
    actual=$(echo "$response" | jq -r "$field" 2>/dev/null || echo "")

    if [ "$actual" = "$expected" ]; then
        pass "$description"
        return 0
    else
        fail "$description (got '$actual', expected '$expected')"
        return 1
    fi
}

# Section 1: OpenAPI Contract Freeze (v1.1.0)
echo -e "${YELLOW}1. OpenAPI Contract Freeze${NC}"
echo "--------------------------------"

# Check OpenAPI version
if [ -f "$PROJECT_ROOT/docs/openapi.yaml" ]; then
    version=$(grep -E "^\s+version:" "$PROJECT_ROOT/docs/openapi.yaml" | awk '{print $2}')
    if [ "$version" = "1.1.0" ]; then
        pass "OpenAPI version is 1.1.0"
    else
        fail "OpenAPI version is $version (expected 1.1.0)"
    fi
else
    fail "OpenAPI file not found at docs/openapi.yaml"
fi

# Check OpenAPI discovery endpoint
check_response "/api/obs/discovery/openapi" 200 "OpenAPI discovery endpoint at /api/obs/discovery/openapi"
check_response "/api/discovery/openapi" 200 "OpenAPI discovery endpoint at /api/discovery/openapi"
check_response "/openapi.yaml" 200 "OpenAPI endpoint at /openapi.yaml"

echo

# Section 2: Schema Versioning
echo -e "${YELLOW}2. Schema Versioning (obs.v1)${NC}"
echo "--------------------------------"

# Check schema_version in integration endpoints
check_json_field "/api/projects/test" ".schema_version" "obs.v1" "Integration endpoint returns schema_version: obs.v1"
check_json_field "/api/mcp/self-status" ".schema_version" "obs.v1" "Self-status endpoint returns schema_version: obs.v1"

# Check all schemas have $id fields
echo -n "Checking all schemas have \$id fields... "
cd "$PROJECT_ROOT"
if node scripts/schema-lint.mjs > /dev/null 2>&1; then
    pass "All schemas have \$id fields"
else
    fail "Some schemas missing \$id fields"
fi

echo

# Section 3: Observability Routes
echo -e "${YELLOW}3. Observability Routes (/api/obs/*)${NC}"
echo "--------------------------------"

# Check obs route aliases
check_response "/api/obs/validate" 200 "Observability validation endpoint"
check_response "/api/obs/migrate" 200 "Observability migration endpoint (POST allowed)"

# Check if obs routes are documented in OpenAPI
if grep -q "/api/obs/" "$PROJECT_ROOT/docs/openapi.yaml" 2>/dev/null; then
    pass "Observability routes documented in OpenAPI"
else
    fail "Observability routes not documented in OpenAPI"
fi

echo

# Section 4: CI/CD Validation Gates
echo -e "${YELLOW}4. CI/CD Validation Gates${NC}"
echo "--------------------------------"

# Check workflow files exist
workflows=("openapi-lint.yml" "schema-lint.yml" "validate-endpoints.yml")
for workflow in "${workflows[@]}"; do
    if [ -f "$PROJECT_ROOT/.github/workflows/$workflow" ]; then
        pass "CI workflow exists: $workflow"
    else
        fail "CI workflow missing: $workflow"
    fi
done

# Check validation scripts exist
scripts=("schema-lint.mjs" "validate-endpoints.mjs" "mcp-smoke.sh")
for script in "${scripts[@]}"; do
    if [ -f "$PROJECT_ROOT/scripts/$script" ]; then
        pass "Validation script exists: $script"
    else
        fail "Validation script missing: $script"
    fi
done

echo

# Section 5: Service Discovery
echo -e "${YELLOW}5. Service Discovery & Health${NC}"
echo "--------------------------------"

check_response "/api/discovery/services" 200 "Service discovery endpoint"
check_response "/api/telemetry-info" 200 "Telemetry info endpoint"
check_json_field "/api/discovery/services" ".mcp.url" "http://127.0.0.1:4319" "MCP service URL in discovery"

echo

# Section 6: Project Integration
echo -e "${YELLOW}6. Project Integration${NC}"
echo "--------------------------------"

# Test project integration probe
check_response "/api/projects" 200 "List projects endpoint"

# Check if manifest validation works
if curl -s -m 5 -H "Authorization: Bearer $BEARER_TOKEN" "$MCP_URL/api/projects/test/manifest" | jq -e '.path' > /dev/null 2>&1; then
    pass "Manifest validation endpoint functional"
else
    fail "Manifest validation endpoint not functional"
fi

echo

# Section 7: Schema Discovery
echo -e "${YELLOW}7. Schema Discovery${NC}"
echo "--------------------------------"

check_response "/api/discovery/schemas" 200 "Schema discovery endpoint"

# Check if schemas are served with ETag
response=$(curl -s -m 5 -I -H "Authorization: Bearer $BEARER_TOKEN" "$MCP_URL/api/schemas/log_events.strict.schema.json" 2>/dev/null)
if echo "$response" | grep -q "ETag:"; then
    pass "Schemas served with ETag headers"
else
    fail "Schemas not served with ETag headers"
fi

echo

# Section 8: MCP Server Health
echo -e "${YELLOW}8. MCP Server Health${NC}"
echo "--------------------------------"

# Check if MCP server is responding
if curl -s -m 5 "$MCP_URL/api/mcp/self-status" > /dev/null 2>&1; then
    pass "MCP server is responding"
else
    fail "MCP server not responding"
fi

# Check HTTP bridge port
if lsof -i:4319 | grep -q LISTEN; then
    pass "MCP server listening on port 4319"
else
    fail "MCP server not listening on port 4319"
fi

echo

# Final Summary
echo "========================================="
echo -e "${YELLOW}Stage 1 Validation Summary${NC}"
echo "========================================="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All Stage 1 requirements validated successfully!${NC}"
    echo -e "${GREEN}✓ Ready for v1.1.0 contract freeze and tagging${NC}"
    exit 0
else
    echo -e "${RED}✗ Some Stage 1 requirements failed validation${NC}"
    echo -e "${RED}✗ Please address the failures before proceeding${NC}"
    exit 1
fi
