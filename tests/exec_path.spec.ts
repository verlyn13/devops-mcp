import { describe, expect, it } from "vitest";
import { safeExecFile } from "../src/lib/exec.js";

describe("path traversal protections", () => {
	it("blocks cwd traversal outside allow roots", async () => {
		const res = await safeExecFile("git", ["--version"], { cwd: "/etc" });
		expect(res.code).toBe(126);
		expect(res.stderr).toContain("policy_violation");
	});
	it("blocks non-allowlisted command absolute path", async () => {
		const res = await safeExecFile("/bin/echo", ["hello"]);
		expect(res.code).toBe(126);
	});
});
