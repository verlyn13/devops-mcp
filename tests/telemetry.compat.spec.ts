import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Backward compatibility: required fields in legacy schema must still be present in current schema
describe("telemetry: contract compatibility", () => {
	it("retains required fields from v1 schema", () => {
		const legacy = JSON.parse(
			fs.readFileSync(
				path.join(process.cwd(), "schema/legacy/log_events.v1.json"),
				"utf8",
			),
		);
		const current = JSON.parse(
			fs.readFileSync(
				path.join(process.cwd(), "schema/log_events.schema.json"),
				"utf8",
			),
		);
		const legacyReq: string[] = legacy.required || [];
		const currentProps = Object.keys(current.properties || {});
		for (const r of legacyReq) {
			expect(currentProps).toContain(r);
		}
	});
});
