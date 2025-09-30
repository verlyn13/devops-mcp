import {
	type SpanContext,
	TraceFlags,
	context,
	trace,
} from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { observeToolDuration } from "../src/lib/telemetry/metrics.js";

describe("telemetry: exemplars/trace correlation", () => {
	it("records histogram with trace attrs when span active (best-effort)", async () => {
		const sc: SpanContext = {
			traceId: "3".repeat(32),
			spanId: "4".repeat(16),
			traceFlags: TraceFlags.SAMPLED,
		};
		const span = trace.wrapSpanContext(sc);
		expect(() =>
			context.with(trace.setSpan(context.active(), span), () => {
				observeToolDuration("unit_test_tool", 12.3);
			}),
		).not.toThrow();
	});
});
