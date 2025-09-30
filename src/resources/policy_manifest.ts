import { z } from "zod";
import { loadConfig } from "../config.js";

export const PolicyManifest = z.object({
	allowPaths: z.array(z.string()),
	allowCommands: z.array(z.string()),
	dryRunDefault: z.boolean(),
	confirmations: z.array(z.string()),
	timeouts: z.record(z.string()).optional(),
});
export type PolicyManifest = z.infer<typeof PolicyManifest>;

export function getPolicyManifest(): PolicyManifest {
	const cfg = loadConfig();
	return {
		allowPaths: cfg.allow.paths,
		allowCommands: cfg.allow.commands,
		dryRunDefault: true,
		confirmations: ["pkg_sync.uninstall", "patch_apply.apply"],
		timeouts: {
			default: cfg.timeouts?.default ?? "30s",
			brew: cfg.timeouts?.brew ?? "300s",
		},
	};
}
