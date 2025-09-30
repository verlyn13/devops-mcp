import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConvergeInput, convergeHost } from "../src/tools/converge_host.js";

describe("converge_host aborts predictably", () => {
	const prev = process.env.DEVOPS_MCP_INERT;
	beforeAll(() => {
		process.env.DEVOPS_MCP_INERT = "1";
	});
	afterAll(() => {
		if (prev === undefined) delete process.env.DEVOPS_MCP_INERT;
		else process.env.DEVOPS_MCP_INERT = prev;
	});

	it("aborts on cancelAfterMs before planning", async () => {
		const out = await convergeHost({
			confirm: true,
			includeRepos: false,
			cancelAfterMs: -1,
		} as any);
		expect(out.aborted).toBe(true);
		expect((out.steps || {}).plan).toBeUndefined();
	});
});
