---
title: Stage 3 — SSE & Observers
category: tracking
component: MCP
status: active
version: 1.1.0
last_updated: 2025-09-30
---

# Stage 3 — SSE & Observers

Epic: <link to MVP Orchestration Epic>
Owners: @AgentA @AgentB @AgentC @AgentD

## Entrance Criteria
- [x] Stage 2 complete (typed clients/adapters integrated; no contract drift)

## MCP — Tasks
- [ ] Maintain alias parity for observer routes (/api/obs/projects/:id/...)\n- [ ] Consider mirroring SSE or ensuring compatibility with Bridge SSE (optional)\n- [ ] Keep OpenAPI + schemas aligned; no Stage 3 breaking changes\n- [ ] Update Stage 2 scripts/docs defaults to MCP_URL/MCP_BASE_URL=4319

## Validation Steps

- Follow repo-specific guides and policies.
- Ports & Env: see docs/policies/ports-and-env.md

## Acceptance
- [ ] Checklist complete; CI gates green; demo steps pass
