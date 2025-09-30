Node Version Policy (System-wide)

Policy
- Use Node 24+ across all repos. Node 24 is the baseline and will be LTS imminently (as of 2025-09-30).
- CI workflows must install Node 24 via `actions/setup-node@v4` with `node-version: '24'`.
- package.json `engines.node` must be `>=24.0.0`.
- Dev instructions must reference Node 24 and include a `mise`/`nvm` snippet to activate Node 24.

Checklist (per repo)
- [ ] package.json → "engines.node": ">=24.0.0"
- [ ] All GitHub Actions workflows set `node-version: '24'`
- [ ] README / quickstart mention Node 24 explicitly
- [ ] Conventions validator includes a rule to flag outdated Node majors in workflows (optional)

