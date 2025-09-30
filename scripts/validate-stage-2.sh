#!/usr/bin/env bash
set -euo pipefail

# Stage 2 Validation Script for DevOps MCP (Agent D)
# Verifies OpenAPI accessibility (where possible), alias parity in docs,
# presence/health of generated TypeScript client, and type checks.

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "Stage 2 Validation for DevOps MCP (Agent D)"
echo "========================================="
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OPENAPI_FILE="$PROJECT_ROOT/docs/openapi.yaml"
MCP_URL="${MCP_URL:-${1:-http://127.0.0.1:4319}}"
BEARER_TOKEN="${MCP_BRIDGE_TOKEN:-devops-mcp-bridge-token-2024}"
OBS_BRIDGE_URL="${OBS_BRIDGE_URL:-http://127.0.0.1:7171}"
INCLUDE_BRIDGE_CHECKS="${INCLUDE_BRIDGE_CHECKS:-}" # any non-empty enables
OBS_BRIDGE_URL="${OBS_BRIDGE_URL:-http://127.0.0.1:7171}"
INCLUDE_BRIDGE_CHECKS="${INCLUDE_BRIDGE_CHECKS:-false}"

PASS=0
FAIL=0
TOTAL=0

pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
fail() { echo -e "${RED}✗${NC} $1"; FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); }

header() {
  echo -e "${YELLOW}$1${NC}"; echo "--------------------------------";
}

# 1) OpenAPI basics
header "1. OpenAPI File & Version"
if [[ -f "$OPENAPI_FILE" ]]; then
  ver=$(grep -E "^\s+version:" "$OPENAPI_FILE" | awk '{print $2}' || true)
  if [[ "$ver" == "1.1.0" ]]; then pass "OpenAPI version is 1.1.0"; else fail "OpenAPI version is '$ver' (expected 1.1.0)"; fi
else
  fail "OpenAPI file not found at docs/openapi.yaml"
fi
echo

# 2) Alias parity (documentation)
header "2. Alias Parity in OpenAPI (discovery + self-status)"
if node "$SCRIPT_DIR/validate-alias-parity.mjs" >/dev/null 2>&1; then
  pass "Alias parity checks passed (docs/openapi.yaml)"
else
  echo "-- details --"
  node "$SCRIPT_DIR/validate-alias-parity.mjs" || true
  fail "Alias parity checks failed"
fi
echo

# 3) Runtime accessibility (optional if bridge is running)
header "3. Runtime Endpoint Accessibility (optional)"
if command -v curl >/dev/null 2>&1; then
  if curl -sSfI "$MCP_URL/openapi.yaml" -H "Authorization: Bearer $BEARER_TOKEN" >/dev/null 2>&1; then
    pass "OpenAPI accessible at $MCP_URL/openapi.yaml"
  else
    fail "OpenAPI not accessible at $MCP_URL/openapi.yaml (start bridge or set MCP_URL)"
  fi

  if curl -sSfI "$MCP_URL/api/obs/discovery/openapi" -H "Authorization: Bearer $BEARER_TOKEN" >/dev/null 2>&1; then
    pass "Alias discovery OpenAPI endpoint accessible: /api/obs/discovery/openapi"
  else
    fail "Alias discovery OpenAPI endpoint not accessible"
  fi

  if curl -sSf "$MCP_URL/api/obs/discovery/services" -H "Authorization: Bearer $BEARER_TOKEN" | jq '.ts' >/dev/null 2>&1; then
    pass "Discovery services (alias) returns JSON with 'ts'"
  else
    fail "Discovery services (alias) not accessible or malformed"
  fi
else
  fail "curl not available for runtime checks"
fi
echo

# 3b) Optional Bridge runtime checks (opt-in)
if [[ -n "$INCLUDE_BRIDGE_CHECKS" ]]; then
  header "3b. Bridge Runtime Checks (opt-in)"
  if command -v curl >/dev/null 2>&1; then
    # Accept either /health or /api/health
    if curl -sSfI "${OBS_BRIDGE_URL}/health" >/dev/null 2>&1 || curl -sSfI "${OBS_BRIDGE_URL}/api/health" >/dev/null 2>&1; then
      pass "Bridge health endpoint reachable"
    else
      fail "Bridge health endpoint not reachable"
    fi
    if curl -sSfI "${OBS_BRIDGE_URL}/api/dashboard/status" >/dev/null 2>&1; then
      pass "Dashboard status reachable"
    else
      fail "Dashboard status not reachable"
    fi
    if curl -sSfI "${OBS_BRIDGE_URL}/api/mcp/proxy/resources" >/dev/null 2>&1; then
      pass "MCP proxy resources reachable"
    else
      fail "MCP proxy resources not reachable"
    fi
  else
    fail "curl not available for bridge checks"
  fi
  echo
fi

# 3b) Bridge runtime checks (optional, env-gated)
if [[ "$INCLUDE_BRIDGE_CHECKS" == "true" ]]; then
  header "3b. Bridge Runtime Checks (OBS Dashboard)"
  if command -v curl >/dev/null 2>&1; then
    if curl -sSfI "$OBS_BRIDGE_URL/health" >/dev/null 2>&1; then
      pass "Bridge health endpoint accessible at $OBS_BRIDGE_URL/health"
    else
      fail "Bridge health endpoint not accessible at $OBS_BRIDGE_URL/health"
    fi

    if curl -sSf "$OBS_BRIDGE_URL/api/dashboard/status" >/dev/null 2>&1; then
      pass "Bridge dashboard status accessible at $OBS_BRIDGE_URL/api/dashboard/status"
    else
      fail "Bridge dashboard status not accessible at $OBS_BRIDGE_URL/api/dashboard/status"
    fi

    if curl -sSf "$OBS_BRIDGE_URL/api/mcp/proxy/resources" >/dev/null 2>&1; then
      pass "Bridge MCP proxy accessible at $OBS_BRIDGE_URL/api/mcp/proxy/resources"
    else
      fail "Bridge MCP proxy not accessible at $OBS_BRIDGE_URL/api/mcp/proxy/resources"
    fi
  else
    fail "curl not available for Bridge runtime checks"
  fi
  echo
fi

# 4) Generated client presence
header "4. Generated MCP TypeScript Client"
GEN_DIR="$PROJECT_ROOT/src/generated/mcp-client"
if [[ -f "$GEN_DIR/index.ts" && -f "$GEN_DIR/api.ts" ]]; then
  pass "Generated client present at src/generated/mcp-client"
else
  fail "Generated client missing at src/generated/mcp-client (run scripts/generate-openapi-client-mcp.sh)"
fi
echo

# 5) Type checks (optional; skip if pnpm not present)
header "5. Type Checks (pnpm check)"
if command -v pnpm >/dev/null 2>&1; then
  if pnpm -s check >/dev/null 2>&1; then
    pass "TypeScript project check passed"
  else
    fail "TypeScript project check failed"
  fi
else
  fail "pnpm not found; skipping type checks"
fi
echo

echo "========================================="
echo -e "${YELLOW}Stage 2 Validation Summary${NC}"
echo "========================================="
echo -e "Total: $TOTAL\nPassed: ${GREEN}$PASS${NC}\nFailed: ${RED}$FAIL${NC}"

if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}✓ All Stage 2 checks passed${NC}"
  exit 0
else
  echo -e "${RED}✗ Stage 2 checks failed; see details above${NC}"
  exit 1
fi
