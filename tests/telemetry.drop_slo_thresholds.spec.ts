import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { __setTestLogger } from "../src/lib/logging/logger.js";
import { __setTestSLOs, reportDropped } from "../src/lib/telemetry/health.js";

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

describe("drop SLO per-kind thresholds", () => {
	it("emits SLOBreach(kind=trace) when per-kind threshold exceeded", async () => {
		const { stream, lines } = capture();
		const logger = pino({}, stream as any);
		__setTestLogger(logger as any);
		__setTestSLOs({ maxDroppedPer5mTrace: 1 });
		reportDropped("trace", 2, 1); // trigger immediately with low warn interval
		await new Promise((r) => setTimeout(r, 20));
		const breach = lines.find(
			(l) => l.event === "SLOBreach" && l.kind === "trace",
		);
		expect(breach).toBeDefined();
		__setTestSLOs(null);
	});
});
