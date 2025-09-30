import { Writable } from "node:stream";
import {
	type SpanContext,
	TraceFlags,
	context,
	trace,
} from "@opentelemetry/api";
import pino from "pino";
import { describe, expect, it } from "vitest";
import {
	__setTestSpanContext,
	buildLogger,
} from "../src/lib/logging/logger.js";

function capture() {
	const lines: any[] = [];
	const stream = new Writable({
		write(chunk, encoding, callback) {
			const s = chunk.toString("utf8").trim();
			if (s) {
				for (const line of s.split("\n")) {
					try {
						lines.push(JSON.parse(line));
					} catch {
						// Skip non-JSON lines
					}
				}
			}
			callback();
		},
	});
	return { stream, lines };
}

describe("logging: trace correlation", () => {
	it("includes trace_id/span_id when inside an active span", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);

		// Create a non-recording span with a fixed context
		const spanContext: SpanContext = {
			traceId: "f".repeat(32), // 128-bit hex
			spanId: "a".repeat(16), // 64-bit hex
			traceFlags: TraceFlags.SAMPLED,
		};
		const fakeSpan = trace.wrapSpanContext(spanContext);

		// Set explicit test span context fallback to avoid API version singleton mismatch
		__setTestSpanContext(spanContext);
		logger.info({ foo: "bar" }, "inside span");

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toHaveProperty("trace_id", "f".repeat(32));
		expect(lines[0]).toHaveProperty("span_id", "a".repeat(16));
		expect(lines[0]).toHaveProperty("msg", "inside span");
		expect(lines[0]).toHaveProperty("foo", "bar");
	});

	it("does not include trace_id when no active span", async () => {
		__setTestSpanContext(null);
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);

		logger.info({ data: "test" }, "no span");

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).not.toHaveProperty("trace_id");
		expect(lines[0]).not.toHaveProperty("span_id");
		expect(lines[0]).toHaveProperty("msg", "no span");
		expect(lines[0]).toHaveProperty("data", "test");
	});

	it("maintains trace context across child loggers", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		const child = logger.child({ tool: "child_tool" });

		// Create a span context
		const spanContext: SpanContext = {
			traceId: "1234567890abcdef".repeat(2),
			spanId: "abcdef1234567890",
			traceFlags: TraceFlags.SAMPLED,
		};
		const fakeSpan = trace.wrapSpanContext(spanContext);

		__setTestSpanContext(spanContext);
		child.info("child with trace");

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toHaveProperty("trace_id", "1234567890abcdef".repeat(2));
		expect(lines[0]).toHaveProperty("span_id", "abcdef1234567890");
		expect(lines[0]).toHaveProperty("tool", "child_tool");
		expect(lines[0]).toHaveProperty("msg", "child with trace");
	});
});
