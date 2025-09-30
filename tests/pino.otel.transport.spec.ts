import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
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

describe("pino otel transport", () => {
	it("does not crash when emitting a line (transport present)", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		__setTestLogger(logger);
		// Emit a line; transport may be a no-op if exporter missing, but must not crash
		logger.info({ tool: "transport_test" }, "hello");
		await new Promise((r) => setTimeout(r, 10));
		expect(lines.length).toBeGreaterThan(0);
	});
});
