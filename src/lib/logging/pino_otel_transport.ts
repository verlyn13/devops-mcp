// Pino transport that forwards JSON log lines to OpenTelemetry Logs API (if initialized)
import { Writable } from "node:stream";
import { getConfig } from "../../config.js";
import { getOtelLogger, mapPinoLevelToSeverity } from "../telemetry/logs.js";

function flattenOnce(
	obj: Record<string, unknown>,
): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) continue;
		if (typeof v === "object" && !Array.isArray(v)) {
			for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
				if (sv == null) continue;
				if (
					typeof sv === "string" ||
					typeof sv === "number" ||
					typeof sv === "boolean"
				)
					out[`${k}.${sk}`] = sv;
			}
		} else if (
			typeof v === "string" ||
			typeof v === "number" ||
			typeof v === "boolean"
		) {
			out[k] = v;
		}
	}
	return out;
}

function filterAttributes(
	attrs: Record<string, unknown>,
): Record<string, string | number | boolean> {
	const cfg = getConfig();
	const allow = new Set<string>([
		// Envelope + tracing
		"event",
		"tool",
		"trace_id",
		"span_id",
		"service",
		"version",
		"env",
		"host",
		// Common event fields
		"plan_sha",
		"audit_id",
		"profile",
		"ok",
		"error_kind",
		"inert",
		"summary",
		"ref",
		"commit",
		"verified_sig",
		"checks_passed",
		"retry_after_ms",
		// Projects
		"project_id",
		"observer",
		"detectors",
		// SLOs
		"slo",
		"threshold",
		"value",
		"kind",
		// Nested keys (flattened)
		"counts.brew_installs",
		"counts.brew_upgrades",
		"counts.mise_installs",
		"counts.dotfiles_changes",
		"residual_counts.brew",
		"residual_counts.mise",
		"residual_counts.dotfiles",
		"audit_ids.pkg",
		"audit_ids.dotfiles",
		// Policy
		"violations",
	]);
	// Merge user-allowlist
	const userAllow = cfg.telemetry?.logs?.attributes_allowlist as
		| string[]
		| undefined;
	if (Array.isArray(userAllow)) for (const k of userAllow) allow.add(k);

	const flat = flattenOnce(attrs);
	const out: Record<string, string | number | boolean> = {};
	let attrTruncCount = 0;
	for (const [k, v] of Object.entries(flat)) {
		if (allow.has(k)) {
			if (typeof v === "string") {
				const s = v as string;
				if (s.length > 512) { out[k] = s.slice(0, 509) + "..."; attrTruncCount++; }
				else out[k] = s;
			} else out[k] = v as any;
		}
	}
	if (attrTruncCount > 0) out["attr_truncated"] = attrTruncCount;
	return out;
}

type SimpleLogger = {
	emit: (rec: {
		body: string;
		attributes?: Record<string, unknown>;
		severityNumber: number;
		severityText: string;
		timestamp: number;
	}) => void;
};

export default function () {
	const otel: SimpleLogger = getOtelLogger() as unknown as SimpleLogger;
	const stream = new Writable({
		write(chunk, _enc, cb) {
			try {
				const s = chunk.toString("utf8");
				for (const line of s.split("\n")) {
					if (!line.trim()) continue;
					try {
						const obj = JSON.parse(line);
						const { level = 30, msg = "", time, ...rest } = obj || {};
						let body = String(msg);
						if (body.length > 8192) { body = body.slice(0, 8189) + "..."; (rest as any).truncated = true; }
						const sev = mapPinoLevelToSeverity(Number(level));
						// Filter attributes defensively; emit only allowlisted, flattened primitives
						const attributes = filterAttributes(
							rest as Record<string, unknown>,
						);
						otel.emit({
							body,
							attributes,
							severityNumber: sev.severityNumber,
							severityText: sev.severityText,
							timestamp: typeof time === "number" ? time : Date.now(),
						});
					} catch {
						// ignore parse errors
					}
				}
			} finally {
				cb();
			}
		},
	});
	return stream as unknown as NodeJS.WritableStream;
}
