#!/usr/bin/env bash
set -euo pipefail

# Generate a TypeScript axios client for the bridge API
# Usage:
#   ./scripts/generate-openapi-client.sh [BRIDGE_URL] [OUT_DIR]

BRIDGE_URL="${1:-${OBS_BRIDGE_URL:-http://127.0.0.1:7171}}"
OUT_DIR="${2:-examples/dashboard/generated/bridge-client}"

mkdir -p "$OUT_DIR"
echo "Fetching OpenAPI from $BRIDGE_URL/openapi.yaml"
curl -sS "$BRIDGE_URL/openapi.yaml" -o "$OUT_DIR/openapi.yaml"

echo "Generating TypeScript axios client into $OUT_DIR"
if npx --yes openapi-typescript-codegen --version >/dev/null 2>&1; then
  npx --yes openapi-typescript-codegen \
    --input "$OUT_DIR/openapi.yaml" \
    --output "$OUT_DIR" \
    --client axios \
    --useOptions \
    --name BridgeClient
elif npx --yes @openapitools/openapi-generator-cli version >/dev/null 2>&1; then
  npx --yes @openapitools/openapi-generator-cli generate \
    -i "$OUT_DIR/openapi.yaml" \
    -g typescript-axios \
    -o "$OUT_DIR"
else
  echo "Falling back to docker openapitools/openapi-generator-cli"
  docker run --rm -v "${PWD}:/local" openapitools/openapi-generator-cli generate \
    -i "/local/$OUT_DIR/openapi.yaml" \
    -g typescript-axios \
    -o "/local/$OUT_DIR"
fi

echo "Done: $OUT_DIR"
