import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import { ensureRepo } from "../lib/git.js";

export const PolicyManifestRepo = z.object({
	version: z.string().optional(),
	files: z.array(z.string()).optional(),
});
export type PolicyManifestRepo = z.infer<typeof PolicyManifestRepo>;

export async function getPolicyManifestRepo(): Promise<PolicyManifestRepo> {
	const cfg = getConfig();
	if (!cfg.system_repo) throw new Error("system_repo not configured");
	const { cachePath } = await ensureRepo();
	const polDir = path.join(cachePath, "policies");
	if (!fs.existsSync(polDir)) return { version: undefined, files: [] };
	return {
		version: "v1",
		files: fs.readdirSync(polDir).map((f) => path.join("policies", f)),
	};
}
