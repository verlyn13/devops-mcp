import { describe, expect, it } from "vitest";
import { mcpHealth } from "../src/tools/mcp_health.js";

describe("mcp_health", () => {
	it("reports protocol and server versions", () => {
		const h = mcpHealth();
		expect(h.protocolVersion).toBeTypeOf("string");
		expect(h.serverVersion).toBeTypeOf("string");
		expect(h.capabilities.tools).toContain("mcp_health");
	});
});
