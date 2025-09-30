import { type Attributes, context, trace } from "@opentelemetry/api";
import { getRunContext } from "./run_context.js";
import { meter } from "./otel.js";

const m = meter();
const toolReq = m.createCounter("mcp_tool_requests_total", {
	description: "Tool requests",
});
const toolErr = m.createCounter("mcp_tool_errors_total", {
	description: "Tool errors",
});
const toolDur = m.createHistogram("mcp_tool_duration_ms", {
	description: "Tool duration ms",
	unit: "ms",
});
const rlDrop = m.createCounter("mcp_tool_ratelimit_dropped_total", {
	description: "Rate-limited tool drops",
});
const telDrop = m.createCounter("telemetry_dropped_total", {
	description: "Telemetry items dropped",
});

export function incTool(name: string, attrs?: Attributes) {
    try {
        const run = getRunContext();
        const merged: Attributes = { tool: name, ...(attrs || {}) };
        if (run.run_id) (merged as any).run_id = run.run_id;
        if (run.profile && !(merged as any).profile) (merged as any).profile = run.profile;
        toolReq.add(1, merged);
    } catch {}
}
export function incToolError(name: string, kind: string, attrs?: Attributes) {
    try {
        const run = getRunContext();
        const merged: Attributes = { tool: name, error_kind: kind, ...(attrs || {}) };
        if (run.run_id) (merged as any).run_id = run.run_id;
        if (run.profile && !(merged as any).profile) (merged as any).profile = run.profile;
        toolErr.add(1, merged);
    } catch {}
}
export function observeToolDuration(name: string, ms: number, extraAttrs?: Attributes) {
    try {
        const span = trace.getSpan(context.active());
        const sc = span?.spanContext();
        const run = getRunContext();
        const attrs: Attributes = { tool: name, ...(extraAttrs || {}) };
        if (run.run_id) (attrs as any).run_id = run.run_id;
        if (run.profile && !(attrs as any).profile) (attrs as any).profile = run.profile;
        if (sc?.traceId) {
            (attrs as Record<string, string>).trace_id = sc.traceId;
            (attrs as Record<string, string>).span_id = sc.spanId;
        }
        toolDur.record(ms, attrs);
    } catch {}
}
export function incRateLimitDrop(name: string) {
	try {
		rlDrop.add(1, { tool: name });
	} catch {}
}
export function incTelemetryDropped(kind: "trace" | "metric" | "log", n = 1) {
	try {
		telDrop.add(n, { kind });
	} catch {}
}
