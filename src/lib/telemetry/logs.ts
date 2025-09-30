import { logs } from "@opentelemetry/api-logs";
import { createRequire } from "node:module";

let initialized = false;
type LogRecord = {
	body: string;
	attributes?: Record<string, unknown>;
	severityNumber: number;
	severityText: string;
	timestamp: number;
};
type LogEmitter = { emit: (rec: LogRecord) => void };
let _testLogger: LogEmitter | null = null;

export function initOtelLogs(endpoint: string, protocol: 'grpc'|'http') {
	if (initialized) return;
	try {
		const req = createRequire(import.meta.url);
		const { LoggerProvider, BatchLogRecordProcessor } = req("@opentelemetry/sdk-logs");
		const LogExporter =
			protocol === 'grpc'
				? req("@opentelemetry/exporter-logs-otlp-grpc").OTLPLogExporter
				: req("@opentelemetry/exporter-logs-otlp-http").OTLPLogExporter;
		const provider = new LoggerProvider();
		const exporter =
			protocol === 'grpc'
				? new LogExporter({ url: endpoint })
				: new LogExporter({ url: endpoint + "/v1/logs" });
		provider.addLogRecordProcessor(new BatchLogRecordProcessor(exporter));
		logs.setGlobalLoggerProvider(provider);
		initialized = true;
	} catch {
		// Silently ignore if logs exporter not available; stderr/file logging remains as fallback
	}
}

export function getOtelLogger(): LogEmitter {
	return (
		(_testLogger as LogEmitter) ??
		(logs.getLogger("devops-mcp") as unknown as LogEmitter)
	);
}
export function __setTestOtelLogger(l: LogEmitter | null) {
	_testLogger = l;
}

export function mapPinoLevelToSeverity(level: number): {
	severityNumber: number;
	severityText: string;
} {
	// Pino: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal
	if (level >= 60) return { severityNumber: 24, severityText: "FATAL" };
	if (level >= 50) return { severityNumber: 17, severityText: "ERROR" };
	if (level >= 40) return { severityNumber: 13, severityText: "WARN" };
	if (level >= 30) return { severityNumber: 9, severityText: "INFO" };
	if (level >= 20) return { severityNumber: 5, severityText: "DEBUG" };
	return { severityNumber: 1, severityText: "TRACE" };
}
