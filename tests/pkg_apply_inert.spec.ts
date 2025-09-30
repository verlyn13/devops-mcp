import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pkgSyncApply, pkgSyncPlan } from "../src/tools/pkg_sync.js";

describe("pkg_sync_apply INERT convergence", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "devops-mcp-"));
	const brewfile = path.join(tmp, "Brewfile");
	const misefile = path.join(tmp, "mise.toml");
	const prev = process.env.DEVOPS_MCP_INERT;
	beforeAll(() => {
		process.env.DEVOPS_MCP_INERT = "1";
	});
	afterAll(() => {
		if (prev === undefined) delete process.env.DEVOPS_MCP_INERT;
		else process.env.DEVOPS_MCP_INERT = prev;
	});

	it("plan -> apply -> plan yields no-op", async () => {
		fs.writeFileSync(brewfile, 'brew "wget"\n');
		fs.writeFileSync(misefile, '[tools]\nnode = "24.0.0"\n');
		const plan1 = await pkgSyncPlan({ brewfile, misefile });
		const out = await pkgSyncApply({
			plan: plan1.planned as any,
			confirm: true,
		});
		expect(out.ok).toBe(true);
		const plan2 = await pkgSyncPlan({ brewfile, misefile });
		const b = plan2.planned.brew;
		const m = plan2.planned.mise;
		expect(
			(b.installs?.length || 0) +
				(b.upgrades?.length || 0) +
				(b.uninstalls?.length || 0),
		).toBe(0);
		expect(
			(m.installs?.length || 0) +
				(m.upgrades?.length || 0) +
				(m.uninstalls?.length || 0),
		).toBe(0);
	});
});
