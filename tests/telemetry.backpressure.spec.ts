import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { __setTestLogger } from "../src/lib/logging/logger.js";
import { reportDropped } from "../src/lib/telemetry/health.js";

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

describe("telemetry: backpressure visibility", () => {
	it("emits a throttled WARN and aggregates dropped counters", async () => {
		const { stream, lines } = capture();
		const logger = pino({}, stream as any);
		__setTestLogger(logger as any);

		reportDropped("trace", 3, 1000);
		reportDropped("metric", 2, 1000);
		// Second burst should be throttled within 1s
		reportDropped("trace", 1, 1000);

		await new Promise((r) => setTimeout(r, 20));
		const warns = lines.filter(
			(l) => l.level === 40 && l.msg === "otel exporters dropping data",
		);
		expect(warns.length).toBe(1);
		expect(warns[0].dropped.trace).toBeGreaterThanOrEqual(4);
		expect(warns[0].dropped.metric).toBeGreaterThanOrEqual(2);
	});
});
