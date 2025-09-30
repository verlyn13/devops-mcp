import { z } from "zod";
import { childLogger } from "./logger.js";

const EVENT_VERSION = '1';
function stamp<T extends Record<string, unknown>>(fields: T): T & { event_version: string; iso_time: string } {
  return { event_version: EVENT_VERSION, iso_time: new Date().toISOString(), ...fields } as T & { event_version: string; iso_time: string };
}

function hasSuspiciousPII(obj: unknown): string | null {
	const patterns = [
		/-----BEGIN (?:OPENSSH )?PRIVATE KEY-----/,
		/-----BEGIN CERTIFICATE-----/,
		/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
	];
	const stack: unknown[] = [obj];
	while (stack.length) {
		const v = stack.pop();
		if (v && typeof v === "object") {
			for (const k of Object.keys(v as Record<string, unknown>))
				stack.push((v as Record<string, unknown>)[k]);
		} else if (typeof v === "string") {
			for (const re of patterns)
				if (re.test(v)) return `pii_match:${re.source}`;
		}
	}
	return null;
}

function devValidate<T>(
	event: string,
	schema: z.ZodType<T>,
	value: unknown,
): boolean {
	const mode = process.env.NODE_ENV || "production";
	const parsed = schema.safeParse(value);
	if (mode === "production") {
		// In production: enforce schema strictly; drop invalid payloads, log once
		if (!parsed.success) {
			childLogger({ event }).warn(
				{ error: parsed.error.message },
				"invalid_event_payload",
			);
			return false;
		}
		return true;
	}
	// In development/ci: schema + PII guard
	if (!parsed.success) {
		childLogger({ event }).warn(
			{ error: parsed.error.message },
			"invalid_event_payload",
		);
		return false;
	}
	const pii = hasSuspiciousPII(value);
	if (pii) {
		childLogger({ event }).warn({ error: pii }, "invalid_event_payload");
		return false;
	}
	return true;
}

// Telemetry health
export function logTelemetryHealth(fields: {
	enabled: boolean;
	endpoint: string;
	protocol: "grpc" | "http";
	sample_ratio: number;
	reachable: boolean;
	lastError?: string;
}) {
  const log = childLogger({ event: "TelemetryHealth" });
  if (fields.reachable) log.info(stamp(fields), "otel exporter reachable");
  else log.warn(stamp(fields), "otel exporter unreachable");
}

// SLO breach
export async function logSLOBreach(fields: {
	slo: string;
	value: number;
	threshold: number;
	kind?: "trace" | "metric" | "log";
	counts?: { trace?: number; metric?: number; log?: number };
	audit_ids?: Record<string, string | undefined>;
	run_id?: string;
}) {
	const schema = z.object({
		slo: z.string(),
		value: z.number(),
		threshold: z.number(),
		kind: z.enum(["trace", "metric", "log"]).optional(),
		counts: z
			.object({
				trace: z.number().optional(),
				metric: z.number().optional(),
				log: z.number().optional(),
			})
			.optional(),
		audit_ids: z.record(z.string()).optional(),
		run_id: z.string().uuid().optional(),
	});
  if (!devValidate("SLOBreach", schema, fields)) return;
  childLogger({ event: "SLOBreach" }).warn(stamp(fields), "slo breach");
  // Optional alerting webhook
  try { (await import('../alerting.js')).maybeAlert({ type: 'slo_breach', ...fields }); } catch {}
}

// Alert route resolution
export function logAlertRouteResolved(fields: { run_id?: string; profile?: string; channel?: string; webhookUrl?: string; ok: boolean; reason?: string }) {
  const schema = z.object({ run_id: z.string().uuid().optional(), profile: z.string().optional(), channel: z.string().optional(), webhookUrl: z.string().optional(), ok: z.boolean(), reason: z.string().optional() });
  if (!devValidate('AlertRouteResolved', schema, fields)) return;
  childLogger({ event: 'AlertRouteResolved' }).info(stamp(fields), 'alert route resolved');
}

// Converge events
export function logConvergePlanned(fields: {
	profile: string;
	commit?: string;
	plan_sha: string;
	run_id?: string;
	counts: {
		brew_installs: number;
		brew_upgrades: number;
		mise_installs: number;
		dotfiles_changes: number;
	};
}) {
	const schema = z.object({
		profile: z.string(),
		commit: z.string().optional(),
		plan_sha: z.string(),
		run_id: z.string().uuid().optional(),
		counts: z.object({
			brew_installs: z.number(),
			brew_upgrades: z.number(),
			mise_installs: z.number(),
			dotfiles_changes: z.number(),
		}),
	});
  if (!devValidate("ConvergePlanned", schema, fields)) return;
  childLogger({ event: "ConvergePlanned" }).info(stamp(fields), "planned converge");
}

export function logConvergeApplied(fields: {
	profile: string;
	commit?: string;
	audit_ids: { pkg?: string; dotfiles?: string };
	residual_counts: { brew: number; mise: number; dotfiles: number };
	ok: boolean;
	run_id?: string;
}) {
	const schema = z.object({
		profile: z.string(),
		commit: z.string().optional(),
		audit_ids: z.object({
			pkg: z.string().optional(),
			dotfiles: z.string().optional(),
		}),
		residual_counts: z.object({
			brew: z.number(),
			mise: z.number(),
			dotfiles: z.number(),
		}),
		ok: z.boolean(),
		run_id: z.string().uuid().optional(),
	});
  if (!devValidate("ConvergeApplied", schema, fields)) return;
  childLogger({ event: "ConvergeApplied" }).info(stamp(fields), "applied converge");
}

export function logConvergeAborted(fields: {
	reason: string;
	step: string;
	error_kind?: string;
	audit_ids?: { pkg?: string; dotfiles?: string };
	run_id?: string;
}) {
	const schema = z.object({
		reason: z.string(),
		step: z.string(),
		error_kind: z.string().optional(),
		audit_ids: z
			.object({ pkg: z.string().optional(), dotfiles: z.string().optional() })
			.optional(),
		run_id: z.string().uuid().optional(),
	});
  if (!devValidate("ConvergeAborted", schema, fields)) return;
  childLogger({ event: "ConvergeAborted" }).warn(stamp(fields), "converge aborted");
}

// Package sync events
export function logPkgSyncPlanned(fields: {
	plan_sha: string;
	counts: {
		brew_installs: number;
		brew_upgrades: number;
		mise_installs: number;
	};
}) {
	const schema = z.object({
		plan_sha: z.string(),
		counts: z.object({
			brew_installs: z.number(),
			brew_upgrades: z.number(),
			mise_installs: z.number(),
		}),
	});
  if (!devValidate("PkgSyncPlanned", schema, fields)) return;
  childLogger({ event: "PkgSyncPlanned" }).info(stamp(fields), "planned package sync");
}

export function logPkgSyncApplied(fields: {
	plan_sha: string;
	inert: boolean;
	residual_counts: { brew: number; mise: number };
	audit_id: string;
	ok: boolean;
}) {
	const schema = z.object({
		plan_sha: z.string(),
		inert: z.boolean(),
		residual_counts: z.object({ brew: z.number(), mise: z.number() }),
		audit_id: z.string(),
		ok: z.boolean(),
	});
  if (!devValidate("PkgSyncApplied", schema, fields)) return;
  childLogger({ event: "PkgSyncApplied" }).info(stamp(fields), "applied package sync");
}

export function logPkgSyncFailed(fields: {
	plan_sha: string;
	residual_counts: { brew: number; mise: number };
	error_kind?: string;
	audit_id?: string;
}) {
	const schema = z.object({
		plan_sha: z.string(),
		residual_counts: z.object({ brew: z.number(), mise: z.number() }),
		error_kind: z.string().optional(),
		audit_id: z.string().optional(),
	});
  if (!devValidate("PkgSyncFailed", schema, fields)) return;
  childLogger({ event: "PkgSyncFailed" }).error(stamp(fields), "package sync failed");
}

// Dotfiles events
export function logDotfilesApplied(fields: {
	profile?: string;
	audit_id: string;
	ok: boolean;
	summary: string;
}) {
	const schema = z.object({
		profile: z.string().optional(),
		audit_id: z.string(),
		ok: z.boolean(),
		summary: z.string(),
	});
  if (!devValidate("DotfilesApplied", schema, fields)) return;
  childLogger({ event: "DotfilesApplied" }).info(stamp(fields), "applied dotfiles");
}

// System events
export function logSystemRepoSync(fields: {
	ref?: string;
	commit: string;
	verified_sig: boolean;
}) {
	const schema = z.object({
		ref: z.string().optional(),
		commit: z.string(),
		verified_sig: z.boolean(),
	});
  if (!devValidate("SystemRepoSync", schema, fields)) return;
  childLogger({ event: "SystemRepoSync" }).info(stamp(fields), "synced system repo");
}

export function logPolicyValidation(fields: {
	ref?: string;
	checks_passed: boolean;
	violations?: string[];
}) {
	const log = childLogger({ event: "PolicyValidation" });
  if (fields.checks_passed) {
    log.info(stamp(fields), "policy validation passed");
  } else {
    log.warn(stamp(fields), "policy validation failed");
  }
}

// Audit events
export function logAuditRetention(fields: {
	calls_removed: number;
	blobs_removed: number;
	retain_days: number;
}) {
  childLogger({ event: "AuditRetention" }).info(
    stamp(fields),
    "audit retention cleanup",
  );
}

// Rate limit events
export function logRateLimitExceeded(fields: {
	tool: string;
	retry_after_ms: number;
}) {
  childLogger({ event: "RateLimitExceeded" }).warn(
    stamp(fields),
    "rate limit exceeded",
  );
}
