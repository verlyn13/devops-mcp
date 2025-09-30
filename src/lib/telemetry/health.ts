import net from "node:net";
import { URL } from "node:url";

export async function probeCollector(
	endpoint: string,
	protocol: "grpc" | "http",
): Promise<{ reachable: boolean; lastError?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1000);
	try {
		if (protocol === "http") {
			const url = new URL(endpoint);
			// Probe traces path via HEAD
			const res = await fetch(new URL("/v1/traces", url), {
				method: "HEAD",
				signal: controller.signal,
			}).catch(async () => {
				// Some collectors reject HEAD; fall back to GET without body
				return fetch(new URL("/v1/traces", url), {
					method: "GET",
					signal: controller.signal,
				});
			});
			clearTimeout(timeout);
			return { reachable: Boolean(res && "status" in res) };
		} else {
			// gRPC: best-effort TCP connect to host:port
			const u = new URL(endpoint);
			const port = Number(u.port || (u.protocol === "https:" ? 443 : 4317));
			const host = u.hostname;
			await new Promise<void>((resolve, reject) => {
				const sock = net.createConnection({ host, port });
				const t = setTimeout(() => {
					sock.destroy();
					reject(new Error("timeout"));
				}, 1000);
				sock.on("connect", () => {
					clearTimeout(t);
					sock.destroy();
					resolve();
				});
				sock.on("error", (err) => {
					clearTimeout(t);
					reject(err);
				});
			});
			clearTimeout(timeout);
			return { reachable: true };
		}
	} catch (e) {
		clearTimeout(timeout);
		return {
			reachable: false,
			lastError: String(e instanceof Error ? e.message : e),
		};
	}
}

let _reachability: { reachable: boolean; lastError?: string } = {
	reachable: false,
};
export function setReachability(ok: boolean, err?: string) {
	_reachability = { reachable: ok, lastError: err };
}
export function getReachability() {
	return _reachability;
}

// Backpressure/drop accounting with throttled warning
let lastWarnAt = 0;
let windowStart = 0;
let windowDropsTotal = 0;
const DROPS: Record<string, number> = { trace: 0, metric: 0, log: 0 };

type SLOCfg = {
	maxDroppedPer5m?: number;
	maxDroppedPer5mTrace?: number;
	maxDroppedPer5mMetric?: number;
	maxDroppedPer5mLog?: number;
};
let __testSLOs: SLOCfg | null = null;
export function __setTestSLOs(s: SLOCfg | null) {
	__testSLOs = s;
}
function getSLOs(): SLOCfg {
	if (__testSLOs) return __testSLOs;
	try {
		const { getConfig } = require("../../config.js");
		const cfg = getConfig();
		return {
			maxDroppedPer5m: cfg.slos?.maxDroppedPer5m,
			maxDroppedPer5mTrace: cfg.slos?.maxDroppedPer5mTrace,
			maxDroppedPer5mMetric: cfg.slos?.maxDroppedPer5mMetric,
			maxDroppedPer5mLog: cfg.slos?.maxDroppedPer5mLog,
		};
	} catch {
		return {};
	}
}
export function reportDropped(
	kind: "trace" | "metric" | "log",
	n = 1,
	warnEveryMs = 5 * 60_000,
) {
	const now = Date.now();
	if (windowStart === 0 || now - windowStart > 5 * 60_000) {
		windowStart = now;
		windowDropsTotal = 0;
	}
	try {
		DROPS[kind] = (DROPS[kind] || 0) + n;
	} catch {}
	windowDropsTotal += n;

	// Throttled WARN with cumulative counts
	if (now - lastWarnAt > warnEveryMs) {
		lastWarnAt = now;
		import("../logging/logger.js")
			.then(({ childLogger }) => {
				try {
					childLogger({ event: "TelemetryHealth" }).warn(
						{ dropped: { ...DROPS } },
						"otel exporters dropping data",
					);
				} catch {}
			})
			.catch(() => {});
	}

	// SLO: maxDroppedPer5m (combined) and per-kind thresholds
	import("../logging/events.js")
		.then((evMod) => {
			try {
				const slos = getSLOs();
				const combined = slos.maxDroppedPer5m ?? 0;
				if (combined > 0 && windowDropsTotal > combined) {
					try {
						evMod.logSLOBreach({
							slo: "maxDroppedPer5m",
							value: windowDropsTotal,
							threshold: combined,
							counts: { ...DROPS },
						});
					} catch {}
				}
				const perTrace = slos.maxDroppedPer5mTrace ?? 0;
				if (perTrace > 0 && (DROPS.trace || 0) > perTrace) {
					try {
						evMod.logSLOBreach({
							slo: "maxDroppedPer5m",
							kind: "trace",
							value: DROPS.trace,
							threshold: perTrace,
							counts: { ...DROPS },
						});
					} catch {}
				}
				const perMetric = slos.maxDroppedPer5mMetric ?? 0;
				if (perMetric > 0 && (DROPS.metric || 0) > perMetric) {
					try {
						evMod.logSLOBreach({
							slo: "maxDroppedPer5m",
							kind: "metric",
							value: DROPS.metric,
							threshold: perMetric,
							counts: { ...DROPS },
						});
					} catch {}
				}
				const perLog = slos.maxDroppedPer5mLog ?? 0;
				if (perLog > 0 && (DROPS.log || 0) > perLog) {
					try {
						evMod.logSLOBreach({
							slo: "maxDroppedPer5m",
							kind: "log",
							value: DROPS.log,
							threshold: perLog,
							counts: { ...DROPS },
						});
					} catch {}
				}
			} catch {}
		})
		.catch(() => {});
}
