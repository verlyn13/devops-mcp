import { describe, expect, it } from "vitest";
import transport from "../src/lib/logging/pino_otel_transport.js";
import { __setTestOtelLogger } from "../src/lib/telemetry/logs.js";

describe("OTLP transport attribute filtering", () => {
	it("emits only allowlisted attributes and flattens nested objects", async () => {
		const records: any[] = [];
		__setTestOtelLogger({
			emit: (rec: any) => {
				records.push(rec);
			},
		});
		const t = transport();
		const line = JSON.stringify({
			level: 30,
			msg: "hello",
			service: "devops-mcp",
			version: "x",
			host: "h",
			env: "local",
			event: "PkgSyncApplied",
			plan_sha: "abc",
			counts: {
				brew_installs: 1,
				brew_upgrades: 2,
				mise_installs: 3,
				dotfiles_changes: 4,
			},
			secret: "should_not_pass",
			nested: { token: "nope" },
		});
		await new Promise<void>((resolve) =>
			(t as any).write(line + "\n", () => resolve()),
		);
		expect(records.length).toBeGreaterThan(0);
		const attrs = records[0].attributes;
		// Allowlisted flat keys exist
		expect(attrs["service"]).toBe("devops-mcp");
		expect(attrs["counts.brew_installs"]).toBe(1);
		// Disallowed keys dropped
		expect(attrs["secret"]).toBeUndefined();
		expect(attrs["nested.token"]).toBeUndefined();
		__setTestOtelLogger(null);
	});
});
