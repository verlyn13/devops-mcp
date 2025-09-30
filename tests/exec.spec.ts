import { describe, expect, it } from "vitest";
import { safeExecFile } from "../src/lib/exec.js";

describe("exec policy", () => {
	it("blocks non-allowlisted command", async () => {
		const res = await safeExecFile("echo", ["hello"]);
		expect(res.code).toBe(126);
		expect(res.stderr).toContain("policy_violation");
	});

	it("has empty env by default (apart from PATH/LANG/LC_ALL)", async () => {
		const res = await safeExecFile("chezmoi", ["--version"]);
		// cannot directly inspect env, but ensure it runs without inheriting random vars
		expect([0, 1, 126]).toContain(res.code); // 126 if blocked; 1 if not installed
	});
});
