import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig } from "../../config.js";
import { TELEMETRY_CONTRACT } from "./contract.js";
import crypto from "node:crypto";
import { getReachability } from "./health.js";

function getVersion(): string {
	try {
		const p = path.join(process.cwd(), "package.json");
		if (fs.existsSync(p)) {
			const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
			return pkg.version ?? "0.0.0";
		}
	} catch {}
	return "0.0.0";
}

export function getTelemetryInfo() {
	const cfg = getConfig();
	const endpoint = cfg.telemetry.endpoint;
	const dataDir =
		cfg.audit?.dir ??
		path.join(os.homedir(), "Library", "Application Support", "devops.mcp");
	const redactPaths = [
		"OPENAI_API_KEY",
		"GITHUB_TOKEN",
		"AWS_SECRET_ACCESS_KEY",
		"ANTHROPIC_API_KEY",
		"*.token",
		"*.secret",
		"*.password",
		"*.apiKey",
		"*.api_key",
		...(cfg.telemetry?.redact?.paths ?? []),
	];
	const censor = cfg.telemetry?.redact?.censor || "[REDACTED]";
	const base = {
		service: { name: "devops-mcp", version: getVersion() },
		enabled: cfg.telemetry.enabled,
		reachable: getReachability().reachable,
		lastError: getReachability().lastError,
		env: cfg.telemetry.env,
		endpoint,
		protocol: cfg.telemetry.protocol,
		tracesUrl: endpoint + "/v1/traces",
		metricsUrl: endpoint + "/v1/metrics",
		contractVersion: TELEMETRY_CONTRACT.version,
		schemaVersion: "2025-09-01",
		cacheTtlSec: 60,
		logs: {
			level: cfg.telemetry.logs.level,
			sink: cfg.telemetry.logs.sink,
			localFile: path.join(dataDir, "logs", "server.ndjson"),
			messageKey: "msg",
		},
		redact: { paths: redactPaths, censor },
		slos: {
			maxResidualPctAfterApply: cfg.slos?.maxResidualPctAfterApply ?? 0,
			maxConvergeDurationMs: cfg.slos?.maxConvergeDurationMs ?? 120000,
			maxDroppedPer5m: cfg.slos?.maxDroppedPer5m ?? 0,
			maxDroppedPer5mTrace: cfg.slos?.maxDroppedPer5mTrace ?? 0,
			maxDroppedPer5mMetric: cfg.slos?.maxDroppedPer5mMetric ?? 0,
			maxDroppedPer5mLog: cfg.slos?.maxDroppedPer5mLog ?? 0,
		},
		tracing: {
			tempoBaseUrl: cfg.telemetry.tempo_endpoint || undefined,
			deepLink: cfg.telemetry.tempo_endpoint
				? `${String(cfg.telemetry.tempo_endpoint).replace(/\/$/, "")}/trace/{trace_id}`
				: undefined,
		},
		openapi_url: "/openapi.yaml",
		alerting: {
			enabled: (cfg as any).alerting?.enabled || false,
			defaultWebhook: (cfg as any).alerting?.webhook_url || undefined,
			profiles: (cfg as any).telemetry_profiles || {},
		},
		clock: { skewMsEstimate: 0, source: "unknown" },
		retention: {
			days: cfg.audit?.retainDays ?? 30,
			maxBytes: cfg.audit?.maxBlobBytes ?? 262144,
			backend: cfg.audit?.kind ?? "sqlite",
		},
	};
	const etag = crypto
		.createHash("sha256")
		.update(
			JSON.stringify({
				v: base.contractVersion,
				s: base.schemaVersion,
				t: cfg.telemetry,
				a: (cfg as any).alerting,
				p: (cfg as any).telemetry_profiles || {},
			}),
		)
		.digest("hex");
	return { ...base, etag };
}
