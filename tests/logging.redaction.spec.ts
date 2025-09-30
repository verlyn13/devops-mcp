import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { buildLogger } from "../src/lib/logging/logger.js";

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

describe("logging: JSON & redaction", () => {
	it("emits newline-delimited JSON", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);

		logger.info({ foo: "bar" }, "test message");

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toHaveProperty("msg", "test message");
		expect(lines[0]).toHaveProperty("foo", "bar");
		expect(lines[0]).toHaveProperty("service", "devops-mcp");
	});

	it("redacts sensitive fields", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);

		logger.info(
			{
				OPENAI_API_KEY: "sk-abc123",
				GITHUB_TOKEN: "ghp_secret",
				nested: {
					token: "supersecret",
					password: "mypassword",
					safe: "visible",
				},
			},
			"sensitive data test",
		);

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toHaveProperty("msg", "sensitive data test");
		expect(lines[0].OPENAI_API_KEY).toBe("[REDACTED]");
		expect(lines[0].GITHUB_TOKEN).toBe("[REDACTED]");
		expect(lines[0].nested.token).toBe("[REDACTED]");
		expect(lines[0].nested.password).toBe("[REDACTED]");
		expect(lines[0].nested.safe).toBe("visible");
	});

	it("includes base metadata", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);

		logger.info("metadata test");

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toHaveProperty("service", "devops-mcp");
		expect(lines[0]).toHaveProperty("version");
		expect(lines[0]).toHaveProperty("env");
		expect(lines[0]).toHaveProperty("host");
	});

	it("supports child loggers with additional context", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		const child = logger.child({ tool: "test_tool", request_id: "123" });

		child.info("child logger test");

		// Allow time for stream processing
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toHaveProperty("tool", "test_tool");
		expect(lines[0]).toHaveProperty("request_id", "123");
		expect(lines[0]).toHaveProperty("msg", "child logger test");
	});
});
