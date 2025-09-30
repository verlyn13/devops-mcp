import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import * as metrics from "../lib/metrics.js";
import { getPolicyManifest } from "../resources/policy_manifest.js";

export const McpHealthInput = z.object({}).optional();
export type McpHealthInput = z.infer<typeof McpHealthInput>;

export function mcpHealth() {
	const policy = getPolicyManifest();
	const cfg = getConfig();
	let tel: any = {};
	try {
		const { getReachability } = require("../lib/telemetry/health.js");
		tel = getReachability();
	} catch {}
	let contractVersion: string | undefined;
	try {
		const { TELEMETRY_CONTRACT } = require("../lib/telemetry/contract.js");
		contractVersion = TELEMETRY_CONTRACT.version;
	} catch {}
    return {
        protocolVersion: "2025-03-26",
		offeredProtocolVersion: "2025-03-26",
		negotiatedProtocolVersion: "2025-03-26",
		serverVersion: (() => {
			try {
				const p = path.resolve(
					path.dirname(new URL(import.meta.url).pathname),
					"../../package.json",
				);
				const txt = fs.readFileSync(p, "utf8");
				return JSON.parse(txt).version || "unknown";
			} catch {
				return "unknown";
			}
		})(),
		name: "devops.local",
        capabilities: {
            tools: [
                "mcp_health",
                "patch_apply_check",
                "pkg_sync_plan",
                "pkg_sync_apply",
                "dotfiles_apply",
                "secrets_read_ref",
                "project_discover",
                "project_obs_run",
                "project_health",
            ],
            resources: [
                "dotfiles_state",
                "policy_manifest",
                "pkg_inventory",
                "repo_status",
                "project_manifest",
                "project_status",
                "project_inventory",
            ],
        },
		audit: { kind: cfg.audit.kind },
		limits: cfg.limits,
		metrics: { tools: metrics.snapshot() },
		telemetry: {
			reachable: tel.reachable ?? false,
			lastError: tel.lastError,
			contractVersion,
		},
		policy,
	};
}
