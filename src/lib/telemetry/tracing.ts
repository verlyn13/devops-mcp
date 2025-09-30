import {
	type AttributeValue,
	type Span,
	SpanStatusCode,
	context,
	trace,
} from "@opentelemetry/api";
import { tracer } from "./otel.js";

export async function withSpan<T>(
	name: string,
	attrs: Record<string, unknown>,
	fn: (span: Span) => Promise<T>,
): Promise<T> {
	return await tracer().startActiveSpan(name, async (span) => {
		try {
			if (attrs)
				for (const [k, v] of Object.entries(attrs))
					span.setAttribute(k, toAttributeValue(v));
			const out = await fn(span);
			return out;
		} catch (e: unknown) {
			span.recordException(String(e));
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: String((e as Error)?.message || String(e)),
			});
			throw e as unknown as Error;
		} finally {
			span.end();
		}
	});
}

function toAttributeValue(v: unknown): AttributeValue {
	if (typeof v === "string")
		return v.length > 2048 ? v.slice(0, 2048) + "…" : v;
	if (typeof v === "number" || typeof v === "boolean") return v;
	// Safest default: stringified summary
	try {
		return JSON.stringify(v)?.slice(0, 2048) ?? String(v);
	} catch {
		return String(v);
	}
}
