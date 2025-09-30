Bridge generated client adapter

Steps
- Generate client in this repo:
  - ./scripts/generate-openapi-client.sh examples/dashboard/generated/bridge-client
- In the dashboard repo:
  - mkdir -p src/generated/bridge-client
  - cp -r ../system-setup-update/examples/dashboard/generated/bridge-client/* src/generated/bridge-client/
  - git apply ../system-setup-update/examples/dashboard/patches/bridge-adapter-client.patch
  - Ensure VITE_API_URL points to your dashboard backend (http://localhost:3001)

Notes
- The adapter tries the generated client first and falls back to existing fetch helpers.
- If your paths differ, adjust import paths in the patch before applying.

