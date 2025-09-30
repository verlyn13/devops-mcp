// Stable, importable telemetry contract for consumers (dashboards, setup tools)
export const TELEMETRY_CONTRACT_VERSION = "1.0";

export const LOG_EVENT_ENUM = [
	"TelemetryHealth",
	"SLOBreach",
	"ConvergePlanned",
	"ConvergeApplied",
	"ConvergeAborted",
	"PkgSyncPlanned",
	"PkgSyncApplied",
	"PkgSyncFailed",
	"DotfilesApplied",
	"SystemRepoSync",
	"PolicyValidation",
	"AuditRetention",
	"RateLimitExceeded",
] as const;

export type LogEvent = (typeof LOG_EVENT_ENUM)[number];

export type BaseLog = {
	// Common envelope fields always present
	service: "devops-mcp";
	version: string;
	env: string;
	host: string;
	level?: "debug" | "info" | "warn" | "error" | "fatal";
	msg?: string;
	event?: LogEvent;
	tool?: string;
	trace_id?: string;
	span_id?: string;
	time?: string | number;
};

export type ConvergePlanned = BaseLog & {
	event: "ConvergePlanned";
	profile: string;
	commit?: string;
	plan_sha: string;
	counts: {
		brew_installs: number;
		brew_upgrades: number;
		mise_installs: number;
		dotfiles_changes: number;
	};
};

export type ConvergeApplied = BaseLog & {
	event: "ConvergeApplied";
	profile: string;
	commit?: string;
	audit_ids: { pkg?: string; dotfiles?: string };
	residual_counts: { brew: number; mise: number; dotfiles: number };
	ok: boolean;
};

export type ConvergeAborted = BaseLog & {
	event: "ConvergeAborted";
	reason: string;
	step: string;
	error_kind?: string;
};

export type PkgSyncPlanned = BaseLog & {
	event: "PkgSyncPlanned";
	plan_sha: string;
	counts: {
		brew_installs: number;
		brew_upgrades: number;
		mise_installs: number;
	};
};

export type PkgSyncApplied = BaseLog & {
	event: "PkgSyncApplied";
	plan_sha: string;
	inert: boolean;
	residual_counts: { brew: number; mise: number };
	audit_id: string;
	ok: boolean;
};

export type PkgSyncFailed = BaseLog & {
	event: "PkgSyncFailed";
	plan_sha: string;
	residual_counts: { brew: number; mise: number };
	error_kind?: string;
};

export type DotfilesApplied = BaseLog & {
	event: "DotfilesApplied";
	profile?: string;
	audit_id: string;
	ok: boolean;
	summary: string;
};

export type SystemRepoSync = BaseLog & {
	event: "SystemRepoSync";
	ref?: string;
	commit: string;
	verified_sig: boolean;
};

export type PolicyValidation = BaseLog & {
	event: "PolicyValidation";
	ref?: string;
	checks_passed: boolean;
	violations?: string[];
};

export type AuditRetention = BaseLog & {
	event: "AuditRetention";
	calls_removed: number;
	blobs_removed: number;
	retain_days: number;
};

export type RateLimitExceeded = BaseLog & {
	event: "RateLimitExceeded";
	tool: string;
	retry_after_ms: number;
};

export type LogEnvelope =
	| ({
			event: "SLOBreach";
			slo: string;
			value: number;
			threshold: number;
			kind?: "trace" | "metric" | "log";
			counts?: { trace?: number; metric?: number; log?: number };
			audit_ids?: Record<string, string | undefined>;
	  } & BaseLog)
	| ConvergePlanned
	| ConvergeApplied
	| ConvergeAborted
	| PkgSyncPlanned
	| PkgSyncApplied
	| PkgSyncFailed
	| DotfilesApplied
	| SystemRepoSync
	| PolicyValidation
	| AuditRetention
	| RateLimitExceeded
	| BaseLog;

export type TelemetryContract = {
	version: string;
	otlp: {
		// Path suffixes used by this server when exporting via OTLP/HTTP
		tracesPath: "/v1/traces";
		metricsPath: "/v1/metrics";
		// Note: logs are JSON to stderr/file; OTel Logs exporter is not enabled.
	};
	logs: {
		// Local sink path pattern; `${DATA_DIR}` resolves to audit.dir
		localFilePattern: "${DATA_DIR}/logs/server.ndjson";
		levels: ["debug", "info", "warn", "error", "fatal"];
		messageKey: "msg";
		redactCensorDefault: "[REDACTED]";
	};
	events: LogEvent[];
};

export const TELEMETRY_CONTRACT: TelemetryContract = {
	version: TELEMETRY_CONTRACT_VERSION,
	otlp: { tracesPath: "/v1/traces", metricsPath: "/v1/metrics" },
	logs: {
		localFilePattern: "${DATA_DIR}/logs/server.ndjson",
		levels: ["debug", "info", "warn", "error", "fatal"],
		messageKey: "msg",
		redactCensorDefault: "[REDACTED]",
	},
	events: [...LOG_EVENT_ENUM],
};
