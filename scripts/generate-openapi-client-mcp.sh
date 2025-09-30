#!/usr/bin/env bash
set -euo pipefail

# Generate a TypeScript axios client for this MCP bridge API
# Usage:
#   ./scripts/generate-openapi-client-mcp.sh [OUT_DIR]
# Env:
#   MCP_BASE_URL (default http://127.0.0.1:4319)

BASE_URL=${MCP_BASE_URL:-http://127.0.0.1:4319}
OUT_DIR=${1:-examples/dashboard/generated/mcp-client}
USE_LOCAL_SPEC=${USE_LOCAL_SPEC:-0}

mkdir -p "$OUT_DIR"

# Fetch or copy OpenAPI spec
if [[ "$USE_LOCAL_SPEC" == "1" && -f "docs/openapi.yaml" ]]; then
  echo "Using local OpenAPI at docs/openapi.yaml"
  cp docs/openapi.yaml "${OUT_DIR}/openapi.yaml"
else
  echo "Fetching MCP OpenAPI from ${BASE_URL}/openapi.yaml"
  if ! curl -fsS "${BASE_URL}/openapi.yaml" -o "${OUT_DIR}/openapi.yaml"; then
    if [[ -f "docs/openapi.yaml" ]]; then
      echo "Warning: fetch failed; falling back to local docs/openapi.yaml"
      cp docs/openapi.yaml "${OUT_DIR}/openapi.yaml"
    else
      echo "Error: unable to obtain OpenAPI spec"
      exit 2
    fi
  fi
fi

# Preprocess for generator compatibility (e.g., 3.1 nullable unions)
if command -v node >/dev/null 2>&1 && [[ -f scripts/preprocess-openapi.mjs ]]; then
  echo "Preprocessing OpenAPI for codegen compatibility"
  node scripts/preprocess-openapi.mjs "${OUT_DIR}/openapi.yaml" "${OUT_DIR}/openapi.codegen.yaml" || true
  INPUT_SPEC="${OUT_DIR}/openapi.codegen.yaml"
else
  INPUT_SPEC="${OUT_DIR}/openapi.yaml"
fi

echo "Generating TypeScript axios client into ${OUT_DIR}"

gen_ts_codegen() {
  npx --yes openapi-typescript-codegen \
    --input "${INPUT_SPEC}" \
    --output "${OUT_DIR}" \
    --client axios \
    --useOptions \
    --name MCPClient
}

gen_openapi_generator() {
  npx --yes @openapitools/openapi-generator-cli generate \
    -i "${INPUT_SPEC}" \
    -g typescript-axios \
    -o "${OUT_DIR}"
}

gen_docker_openapi_generator() {
  docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli generate \
    -i "/local/${INPUT_SPEC}" \
    -g typescript-axios \
    -o "/local/${OUT_DIR}"
}

if npx --yes openapi-typescript-codegen --version >/dev/null 2>&1; then
  if gen_ts_codegen; then
    echo "openapi-typescript-codegen: OK"
  else
    echo "openapi-typescript-codegen failed; attempting openapi-generator-cli"
    if npx --yes @openapitools/openapi-generator-cli version >/dev/null 2>&1; then
      if gen_openapi_generator; then
        echo "openapi-generator-cli: OK"
      else
        echo "openapi-generator-cli (node) failed; trying docker"
        gen_docker_openapi_generator
      fi
    else
      echo "Falling back to docker openapi-generator-cli"
      gen_docker_openapi_generator
    fi
  fi
elif npx --yes @openapitools/openapi-generator-cli version >/dev/null 2>&1; then
  gen_openapi_generator
else
  echo "Falling back to docker openapi-generator-cli"
  gen_docker_openapi_generator
fi

echo "Done: ${OUT_DIR}"
