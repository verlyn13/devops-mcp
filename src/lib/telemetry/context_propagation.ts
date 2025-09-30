import { context, propagation, trace } from '@opentelemetry/api';

export function extractTraceContext(headers: Record<string, string>) {
  const ctx = propagation.extract(context.active(), headers);
  return trace.getSpan(ctx)?.spanContext();
}

export function injectTraceContext(headers: Record<string, string>) {
  propagation.inject(context.active(), headers);
  return headers;
}

