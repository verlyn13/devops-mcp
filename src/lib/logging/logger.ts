import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type SpanContext, context, trace } from "@opentelemetry/api";
import pino, {
	type Logger,
	type LoggerOptions,
	type DestinationStream,
	type TransportTargetOptions,
} from "pino";
import { getConfig } from "../../config.js";

// Bind OTel trace/span if present
let __testSpan: SpanContext | null = null;
function traceBindings() {
	try {
		const span = trace.getSpan(context.active());
		const sc = span?.spanContext();
		if (sc?.traceId) return { trace_id: sc.traceId, span_id: sc.spanId };
	} catch {}
	if (__testSpan?.traceId)
		return { trace_id: __testSpan.traceId, span_id: __testSpan.spanId };
	return {};
}

// Redaction keys (merge with config.telemetry.redact if present)
const DEFAULT_REDACT = [
	"OPENAI_API_KEY",
	"GITHUB_TOKEN",
	"AWS_SECRET_ACCESS_KEY",
	"ANTHROPIC_API_KEY",
	"*.token",
	"*.secret",
	"*.password",
	"*.apiKey",
	"*.api_key",
	"*.privateKey",
	"*.sshKey",
	"*.pem",
];

// Get version from package.json safely
function getVersion(): string {
	try {
		const pkgPath = path.join(process.cwd(), "package.json");
		if (fs.existsSync(pkgPath)) {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			return pkg.version ?? "0.0.0";
		}
	} catch {}
	return "0.0.0";
}

export function buildLogger(destOverride?: DestinationStream): Logger {
	const cfg = getConfig();
	const env = cfg.telemetry?.env ?? "local";
	const dataDir =
		cfg.audit?.dir ??
		path.join(os.homedir(), "Library", "Application Support", "devops.mcp");
	const redactPaths = [
		...DEFAULT_REDACT,
		...(cfg.telemetry?.redact?.paths ?? []),
	];
	const censor = cfg.telemetry?.redact?.censor || "[REDACTED]";

	const opts: LoggerOptions = {
		base: {
			service: "devops-mcp",
			version: getVersion(),
			env,
			host: os.hostname(),
		},
		level: cfg.telemetry?.logs?.level ?? (env === "local" ? "debug" : "info"),
		redact: {
			paths: redactPaths,
			censor,
		},
		mixin: traceBindings,
		messageKey: "msg",
	};

	// If override provided (for testing), use it
	if (destOverride) return pino(opts, destOverride);

	const enableOtelLogs = cfg.telemetry?.export === "otlp";
	// Environment-specific transport strategy
	if (env === "local") {
		// In tests, avoid touching the filesystem
		if (process.env.NODE_ENV === "test" || process.env.VITEST) {
			return pino(opts, pino.destination(2));
		}
		// Ensure logs directory exists
		const logsDir = path.join(dataDir, "logs");
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}
    // Rotation helper: daily or when size grows too large
    try {
      const cur = path.join(logsDir, "server.ndjson");
      let st: fs.Stats | null = null;
      try {
        st = fs.statSync(cur);
      } catch {
        st = null;
      }
      if (st) {
        const d = new Date(st.mtimeMs);
        const today = new Date();
        const fmt = (x: Date) =>
          `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
        const cfg = getConfig();
        const maxMb = Number(cfg.telemetry?.logs?.max_file_mb ?? 64);
        const tooBig = st.size > Math.max(8, maxMb) * 1024 * 1024; // lower-bound 8MB
        if (fmt(d) !== fmt(today) || tooBig) {
          let attempt = 0;
          let rotated: string;
          do {
            const ts = `${d.getHours().toString().padStart(2,'0')}${d.getMinutes().toString().padStart(2,'0')}${d.getSeconds().toString().padStart(2,'0')}`;
            const suffix = attempt === 0 ? "" : `-${process.pid}-${attempt}`;
            rotated = path.join(logsDir, `server-${fmt(d)}-${ts}${suffix}.ndjson`);
            attempt++;
          } while (fs.existsSync(rotated) && attempt < 5);
          try {
            fs.renameSync(cur, rotated!);
          } catch (e) {
						try {
							process.stderr.write(
								`[logger] rotate failed: ${String((e as Error).message)}\n`,
							);
						} catch {}
					}
        }
      }
    } catch (e) {
			try {
				process.stderr.write(
					`[logger] rotate check failed: ${String((e as Error).message)}\n`,
				);
			} catch {}
		}

		// Pretty to TTY + JSON file for audit troubleshooting
		const targets: TransportTargetOptions[] = [
			{
				target: "pino-pretty",
				options: { colorize: true, translateTime: "SYS:standard" },
				level: opts.level,
			},
			{
				target: "pino/file",
				options: {
					destination: path.join(logsDir, "server.ndjson"),
					mkdir: true,
				},
				level: opts.level,
			},
		];
		if (enableOtelLogs) {
			targets.push({
				target: new URL("./pino_otel_transport.js", import.meta.url).pathname,
				level: opts.level,
			});
		}
		const transport = pino.transport({ targets });
		return pino(opts, transport);
	}

	// CI/Prod: JSON to stderr; add OTel logs transport if enabled
	if (enableOtelLogs) {
		const transport = pino.transport({
			targets: [
				{ target: "pino/file", options: { destination: 2 }, level: opts.level },
				{
					target: new URL("./pino_otel_transport.js", import.meta.url).pathname,
					level: opts.level,
				},
			],
		});
		return pino(opts, transport);
	}
	return pino(opts, pino.destination(2));
}

// Singleton logger
let _logger: Logger | null = null;

export function logger(): Logger {
	if (!_logger) {
		_logger = buildLogger();
	}
	return _logger;
}

// Helper to create scoped/child loggers
export function childLogger(bindings: Record<string, unknown>): Logger {
	return logger().child(bindings);
}

// Test helper to inject custom logger
export function __setTestLogger(l: Logger): void {
	_logger = l;
}
export function __setTestSpanContext(sc: SpanContext | null): void {
	__testSpan = sc;
}
