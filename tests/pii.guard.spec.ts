import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { logConvergePlanned } from "../src/lib/logging/events.js";
import { __setTestLogger, buildLogger } from "../src/lib/logging/logger.js";

function capture() {
	const lines: any[] = [];
	const stream = new Writable({
		write(chunk, _enc, cb) {
			const s = chunk.toString("utf8").trim();
			if (s)
				for (const line of s.split("\n")) {
					try {
						lines.push(JSON.parse(line));
					} catch {}
				}
			cb();
		},
	});
	return { stream, lines };
}

describe("pii guard (dev-only)", () => {
	it("flags PEM blocks in dev mode", async () => {
		process.env.NODE_ENV = "development";
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		__setTestLogger(logger);
		const payload: any = {
			profile: "local",
			plan_sha: "x",
			counts: {
				brew_installs: 0,
				brew_upgrades: 0,
				mise_installs: 0,
				dotfiles_changes: 0,
			},
			pem: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----",
		};
		// @ts-ignore testing guard
		logConvergePlanned(payload);
		await new Promise((r) => setTimeout(r, 10));
		const hit = lines.some((l) => l.msg === "invalid_event_payload");
		expect(hit).toBe(true);
		process.env.NODE_ENV = "test";
	});
});
