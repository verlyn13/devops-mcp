import {
	DiagConsoleLogger,
	DiagLogLevel,
	diag,
	metrics,
	trace,
} from "@opentelemetry/api";
import type { ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { getConfig } from "../../config.js";
import { logTelemetryHealth } from "../logging/events.js";
import { logger } from "../logging/logger.js";
import { probeCollector, reportDropped, setReachability } from "./health.js";
import { initOtelLogs } from "./logs.js";
import { createRequire } from "node:module";

let initialized = false;

export function initTelemetry(opts: {
	enabled: boolean;
	endpoint: string;
	protocol: "grpc" | "http";
	sampleRatio: number;
	serviceName: string;
	serviceVersion: string;
}) {
	if (initialized || !opts.enabled) return;
	try {
		// Lazy import SDK to avoid hard dep when disabled
		const req = createRequire(import.meta.url);
		const { NodeSDK } = req("@opentelemetry/sdk-node");
		const res = req("@opentelemetry/resources");
		const sem = req("@opentelemetry/semantic-conventions");
		const TraceExporter =
			opts.protocol === "grpc"
				? req("@opentelemetry/exporter-trace-otlp-grpc").OTLPTraceExporter
				: req("@opentelemetry/exporter-trace-otlp-http").OTLPTraceExporter;
		const MetricExporter =
			opts.protocol === "grpc"
				? req("@opentelemetry/exporter-metrics-otlp-grpc").OTLPMetricExporter
				: req("@opentelemetry/exporter-metrics-otlp-http").OTLPMetricExporter;

		const resource = new res.Resource({
			[sem.SEMRESATTRS_SERVICE_NAME]: opts.serviceName,
			[sem.SEMRESATTRS_SERVICE_VERSION]: opts.serviceVersion,
			"deployment.environment": process.env.TELEMETRY_ENV || "local",
		});

		const otlpTraces =
			opts.protocol === "grpc"
				? new TraceExporter({ url: opts.endpoint })
				: new TraceExporter({ url: opts.endpoint + "/v1/traces" });
		const otlpMetrics =
			opts.protocol === "grpc"
				? new MetricExporter({ url: opts.endpoint })
				: new MetricExporter({ url: opts.endpoint + "/v1/metrics" });

		// Wrap exporters to observe drops/errors
		const wrappedTraceExporter: SpanExporter = {
			export(spans: ReadableSpan[], cb: (res: ExportResult) => void) {
				try {
					otlpTraces.export(spans, (res: ExportResult) => {
						try {
							const r: unknown = res;
							// Narrow to object with optional numeric code
							if (
								r &&
								typeof r === "object" &&
								"code" in (r as Record<string, unknown>)
							) {
								const code = (r as { code?: number }).code;
								if (code === 1) reportDropped("trace", spans?.length || 1);
							}
						} catch {}
						cb(res);
					});
				} catch (e) {
					try {
						reportDropped("trace", spans?.length || 1);
					} catch {}
					cb({} as ExportResult);
				}
			},
			shutdown() {
				return otlpTraces.shutdown();
			},
		};
		type MetricExporterLike = {
			export: (metrics: unknown) => Promise<unknown> | unknown;
			forceFlush?: () => Promise<unknown> | unknown;
			shutdown?: () => Promise<unknown> | unknown;
		};
		const wrappedMetricExporter: MetricExporterLike = {
			export(metrics: unknown) {
				try {
					const res = (otlpMetrics as unknown as MetricExporterLike).export(
						metrics,
					);
					if (res && typeof (res as Promise<unknown>).then === "function") {
						return (res as Promise<unknown>).catch((err: unknown) => {
							try {
								reportDropped("metric", 1);
							} catch {}
							throw err;
						});
					}
					return res;
				} catch (e) {
					try {
						reportDropped("metric", 1);
					} catch {}
					throw e;
				}
			},
			forceFlush() {
				return (otlpMetrics as unknown as MetricExporterLike).forceFlush?.();
			},
			shutdown() {
				return (otlpMetrics as unknown as MetricExporterLike).shutdown?.();
			},
		};
		const sdk = new NodeSDK({
			resource,
			traceExporter: wrappedTraceExporter,
			metricExporter: wrappedMetricExporter,
			metricInterval: 60000,
		});
		sdk.start();
		initialized = true;
		try {
			initOtelLogs(opts.endpoint, opts.protocol);
		} catch {}
		// Reachability probe (async, no-throw)
		probeCollector(opts.endpoint, opts.protocol)
			.then((res) => {
				setReachability(res.reachable, res.lastError);
				try {
					logTelemetryHealth({
						enabled: true,
						endpoint: opts.endpoint,
						protocol: opts.protocol,
						sample_ratio: opts.sampleRatio,
						reachable: res.reachable,
						lastError: res.lastError,
					});
				} catch {}
				try {
					process.stderr.write(
						`otel exporter: reachable=${res.reachable} protocol=${opts.protocol} endpoint=${opts.endpoint}\n`,
					);
				} catch {}
			})
			.catch((e) => {
				try {
					setReachability(false, String(e));
					logger().error(
						{ error: String(e) },
						"telemetry reachability probe failed",
					);
				} catch {}
			});

		// Background re-probe with exponential backoff when unreachable
		let backoffMs = 1000;
		const maxBackoff = 60_000;
		const reprobe = () => {
			try {
				const { getReachability } = require('./health.js');
				const r = getReachability();
				if (r.reachable) { backoffMs = 1000; setTimeout(reprobe, 10_000); return; }
			} catch {}
			probeCollector(opts.endpoint, opts.protocol).then((res) => {
				setReachability(res.reachable, res.lastError);
				if (res.reachable) { try { logger().info({ event: 'TelemetryHealth', reachable: true }, 'otel reachable again'); } catch {} backoffMs = 1000; }
			}).catch((err) => {
				try { logger().warn({ event: 'TelemetryHealth', error: String(err), backoffMs }, 'otel probe failed; backing off'); } catch {}
			}).finally(() => {
				backoffMs = Math.min(backoffMs * 2, maxBackoff);
				setTimeout(reprobe, backoffMs);
			});
		};
		setTimeout(reprobe, 15_000);
	} catch (e) {
		try {
			diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
			diag.warn("otel init failed: " + String((e as Error).message));
		} catch {}
		try {
			logger().error({ error: String(e) }, "telemetry init failed");
		} catch {}
	}
}

export function tracer() {
	return trace.getTracer("devops-mcp");
}
export function meter() {
	return metrics.getMeter("devops-mcp");
}
