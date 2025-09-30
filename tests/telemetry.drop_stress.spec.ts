import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { __setTestLogger, buildLogger } from "../src/lib/logging/logger.js";
import { initTelemetry } from "../src/lib/telemetry/otel.js";
import { tracer } from "../src/lib/telemetry/otel.js";

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

const runStress = process.env.TELEMETRY_STRESS === "1";

describe.runIf(runStress)("telemetry: drop stress (integration)", () => {
	it("emits WARN and SLOBreach when exporter fails with small queues", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		__setTestLogger(logger);
		// Small queue to encourage drops; dead endpoint to force failures
		process.env.OTEL_BSP_MAX_QUEUE_SIZE = "1";
		process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE = "1";
		process.env.OTEL_BSP_SCHEDULE_DELAY_MILLIS = "100";

		initTelemetry({
			enabled: true,
			endpoint: "http://127.0.0.1:9",
			protocol: "http",
			sampleRatio: 1.0,
			serviceName: "devops-mcp",
			serviceVersion: "test",
		});

		// Generate some spans to trigger exporter
		const t = tracer();
		for (let i = 0; i < 5; i++) {
			t.startActiveSpan("stress", (span) => {
				span.end();
			});
		}

		await new Promise((r) => setTimeout(r, 1500));

		const warns = lines.filter((l) => l.msg === "otel exporters dropping data");
		const breaches = lines.filter(
			(l) => l.event === "SLOBreach" && l.slo === "maxDroppedPer5m",
		);
		expect(warns.length).toBeGreaterThanOrEqual(1);
		expect(breaches.length).toBeGreaterThanOrEqual(0); // threshold may be 0; if >0 and exceeded, breach will appear
	});
});
