export function getTelemetryInfoStub() {
  return {
    service: { name: 'devops-mcp', version: '0.3.0' },
    enabled: true,
    reachable: true,
    lastError: null,
    env: 'local',
    endpoint: 'http://127.0.0.1:4318',
    protocol: 'http',
    tracesUrl: 'http://127.0.0.1:4318/v1/traces',
    metricsUrl: 'http://127.0.0.1:4318/v1/metrics',
    contractVersion: '1.0',
    logs: {
      level: 'info', sink: 'stderr',
      localFile: process.env.TELEMETRY_LOG_FILE || `${process.env.HOME}/Library/Application Support/devops.mcp/logs/server.ndjson`,
      messageKey: 'msg'
    },
    redact: { paths: ['*.token','*.secret'], censor: '[REDACTED]' },
    slos: { maxResidualPctAfterApply: 5, maxConvergeDurationMs: 120000, maxDroppedPer5m: 100 },
  };
}

