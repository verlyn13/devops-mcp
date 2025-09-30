import { describe, expect, it } from "vitest";
import { allow, setRate } from "../src/lib/ratelimit.js";

describe("ratelimit", () => {
	it("limits to configured rps", async () => {
		setRate("test", 2);
		const a = allow("test", 2);
		const b = allow("test", 2);
		const c = allow("test", 2);
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		expect(c.ok).toBe(false);
	});
});
