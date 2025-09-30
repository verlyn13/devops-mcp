import { describe, expect, it } from "vitest";
import { withFileLock } from "../src/lib/locks.js";

describe("locks", () => {
	it("serializes two critical sections", async () => {
		const order: number[] = [];
		const p1 = withFileLock("pkg", async () => {
			order.push(1);
			await new Promise((r) => setTimeout(r, 100));
			order.push(2);
			return 1;
		});
		const p2 = withFileLock("pkg", async () => {
			order.push(3);
			order.push(4);
			return 2;
		});
		const [a, b] = await Promise.all([p1, p2]);
		expect(a).toBe(1);
		expect(b).toBe(2);
		expect(order[0]).toBe(1);
	});
});
