export const METRICS_MAPPING = {
  convergenceSuccessRate: `
    (sum(rate(mcp_tool_requests_total{tool="converge_host"}[5m]))
     - sum(rate(mcp_tool_errors_total{tool="converge_host"}[5m])))
    / sum(rate(mcp_tool_requests_total{tool="converge_host"}[5m]))
  `,
  convergenceP95: `
    histogram_quantile(0.95,
      sum(rate(mcp_tool_duration_ms_bucket{tool="converge_host"}[5m])) by (le)
    )
  `,
};

