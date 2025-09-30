// Override SDK protocol version to support 2025-03-26
// The SDK is outdated and only supports up to 2024-11-05
// This patch adds support for the current MCP protocol version

export const CURRENT_PROTOCOL_VERSION = "2025-03-26";
export const OVERRIDE_SUPPORTED_VERSIONS = [
	"2025-03-26",
	"2024-11-05",
	"2024-10-07",
];
