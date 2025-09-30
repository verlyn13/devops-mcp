import { describe, expect, it } from "vitest";
import { normalizeMiseList } from "../src/lib/mise.js";

describe("mise normalizer", () => {
	it("normalizes array and object shapes equivalently", () => {
		const arr = [
			{ plugin: "node", version: "24.0.0" },
			{ plugin: "python", version: "3.13.0" },
		];
		const obj = {
			a: { plugin: "node", version: "24.0.0" },
			b: { plugin: "python", version: "3.13.0" },
		};
		const na = normalizeMiseList(arr);
		const nb = normalizeMiseList(obj);
		expect(na).toEqual(nb);
		expect(na[0].name).toBe("node");
		expect(na[0].version).toBe("24.0.0");
	});
});
