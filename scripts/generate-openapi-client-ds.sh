#!/usr/bin/env bash
set -euo pipefail

# Generate a TypeScript axios client for the DS API
# Usage:
#   ./scripts/generate-openapi-client-ds.sh [OUT_DIR]
# Env:
#   DS_BASE_URL (default http://127.0.0.1:7777)

BASE_URL=${DS_BASE_URL:-http://127.0.0.1:7777}
OUT_DIR=${1:-examples/dashboard/generated/ds-client}
SPEC=${2:-}

mkdir -p "$OUT_DIR"
if [[ -n "$SPEC" ]]; then
  echo "Using DS OpenAPI from ${SPEC}"
  cp "$SPEC" "${OUT_DIR}/openapi.yaml"
else
  echo "Fetching DS OpenAPI from ${BASE_URL}/openapi.yaml"
  curl -sS "${BASE_URL}/openapi.yaml" -o "${OUT_DIR}/openapi.yaml"
fi

echo "Generating TypeScript axios client into ${OUT_DIR}"
if npx --yes openapi-typescript-codegen --version >/dev/null 2>&1; then
  npx --yes openapi-typescript-codegen \
    --input "${OUT_DIR}/openapi.yaml" \
    --output "${OUT_DIR}" \
    --client axios \
    --useOptions \
    --name DSClient
elif npx --yes @openapitools/openapi-generator-cli version >/dev/null 2>&1; then
  npx --yes @openapitools/openapi-generator-cli generate \
    -i "${BASE_URL}/openapi.yaml" \
    -g typescript-axios \
    -o "${OUT_DIR}"
else
  echo "Falling back to docker openapitools/openapi-generator-cli"
  docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli generate \
    -i "${BASE_URL}/openapi.yaml" \
    -g typescript-axios \
    -o "/local/${OUT_DIR}"
fi

echo "Done: ${OUT_DIR}"
