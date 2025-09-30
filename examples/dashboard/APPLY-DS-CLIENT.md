DS generated client adapter

Steps
- Generate DS client in this repo:
  - DS_BASE_URL=http://127.0.0.1:7777 ./scripts/generate-openapi-client-ds.sh examples/dashboard/generated/ds-client
- In the dashboard repo:
  - mkdir -p src/generated/ds-client
  - cp -r ../system-setup-update/examples/dashboard/generated/ds-client/* src/generated/ds-client/
  - git apply ../system-setup-update/examples/dashboard/patches/ds-adapter-template.patch
  - Wire dsAdapter.js exports into your components where DS health/capabilities are needed

Notes
- Set VITE_DS_URL and VITE_DS_TOKEN as needed in dashboard env.
- If generated client names differ (e.g., DefaultApi), adapt imports accordingly.

