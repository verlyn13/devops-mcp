import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import {
	type SpanContext,
	TraceFlags,
	context,
	trace,
} from "@opentelemetry/api";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
	logAuditRetention,
	logConvergeAborted,
	logConvergeApplied,
	logConvergePlanned,
	logDotfilesApplied,
	logPkgSyncApplied,
	logPkgSyncFailed,
	logPkgSyncPlanned,
	logPolicyValidation,
	logRateLimitExceeded,
	logSystemRepoSync,
	logTelemetryHealth,
} from "../src/lib/logging/events.js";
import {
	__setTestLogger,
	__setTestSpanContext,
	buildLogger,
} from "../src/lib/logging/logger.js";

function capture() {
	const lines: any[] = [];
	const stream = new Writable({
		write(chunk, _enc, cb) {
			const s = chunk.toString("utf8").trim();
			if (s) {
				for (const line of s.split("\n")) {
					try {
						lines.push(JSON.parse(line));
					} catch {}
				}
			}
			cb();
		},
	});
	return { stream, lines };
}

function strictValidate(
	schemaPath: string,
	obj: any,
): { ok: boolean; errors?: string[] } {
	const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
	const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
	const validate = ajv.compile(schema);
	const ok = validate(obj) as boolean;
	return {
		ok,
		errors: (validate.errors || []).map(
			(e) => `${e.instancePath} ${e.message}`,
		),
	};
}

describe("telemetry: contract conformance", () => {
	it("emits one of each event and conforms to schema; includes trace ids when span active", async () => {
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		__setTestLogger(logger);
		// For contract shape testing, we can just rely on the configured logger
		const spanContext: SpanContext = {
			traceId: "1".repeat(32),
			spanId: "2".repeat(16),
			traceFlags: TraceFlags.SAMPLED,
		};
		const fakeSpan = trace.wrapSpanContext(spanContext);
		__setTestSpanContext(spanContext);
		// Emit representatives
		logTelemetryHealth({
			enabled: true,
			endpoint: "http://127.0.0.1:4318",
			protocol: "http",
			sample_ratio: 1.0,
			reachable: true,
		});
		logConvergePlanned({
			profile: "local",
			plan_sha: "abc",
			counts: {
				brew_installs: 0,
				brew_upgrades: 0,
				mise_installs: 0,
				dotfiles_changes: 0,
			},
		});
		logConvergeApplied({
			profile: "local",
			audit_ids: { pkg: "p", dotfiles: "d" },
			residual_counts: { brew: 0, mise: 0, dotfiles: 0 },
			ok: true,
		});
		logConvergeAborted({ reason: "x", step: "pkg" });
		logPkgSyncPlanned({
			plan_sha: "abc",
			counts: { brew_installs: 1, brew_upgrades: 0, mise_installs: 2 },
		});
		logPkgSyncApplied({
			plan_sha: "abc",
			inert: false,
			residual_counts: { brew: 0, mise: 0 },
			audit_id: "z",
			ok: true,
		});
		logPkgSyncFailed({
			plan_sha: "abc",
			residual_counts: { brew: 1, mise: 0 },
		});
		logDotfilesApplied({ audit_id: "d", ok: true, summary: "ok" });
		logSystemRepoSync({ commit: "deadbeef", verified_sig: true });
		logPolicyValidation({ checks_passed: true });
		logAuditRetention({ calls_removed: 1, blobs_removed: 0, retain_days: 30 });
		logRateLimitExceeded({ tool: "x", retry_after_ms: 1000 });

		// Let stream settle
		await new Promise((r) => setTimeout(r, 10));

		expect(lines.length).toBeGreaterThan(0);
		const schemaPath = path.join(
			process.cwd(),
			"schema",
			"log_events.strict.schema.json",
		);
		for (const obj of lines) {
			const { ok, errors } = strictValidate(schemaPath, obj);
			if (!ok) {
				console.error("Validation failed for:", JSON.stringify(obj, null, 2));
				console.error("Errors:", errors);
			}
			expect(ok).toBe(true);
			// Assert trace correlation when inside span
			expect(obj).toHaveProperty("trace_id");
			expect(obj).toHaveProperty("span_id");
		}
		process.stdout.write(
			"telemetry schema: all events validated (Ajv strict)\n",
		);
	});

	it("rejects bad payload in dev via guard (negative)", async () => {
		process.env.NODE_ENV = "development";
		const { stream, lines } = capture();
		const logger = buildLogger(stream as any);
		__setTestLogger(logger);
		// Intentionally omit required fields using any-cast
		// Should result in an invalid_event_payload warn rather than standard event
		// @ts-expect-error runtime guard test
		logConvergeApplied({
			profile: "local",
			residual_counts: { brew: 0, mise: 0, dotfiles: 0 },
			ok: true,
		});
		await new Promise((r) => setTimeout(r, 10));
		const hadInvalid = lines.some((l) => l.msg === "invalid_event_payload");
		expect(hadInvalid).toBe(true);
		process.env.NODE_ENV = "test";
	});
});
