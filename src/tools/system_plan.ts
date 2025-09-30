import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import { repoCacheDir } from "../lib/git.js";
import { planSha } from "../lib/provenance.js";
import { pkgSyncPlan } from "./pkg_sync.js";
import { RepoSyncInput, systemRepoSync } from "./system_repo_sync.js";

export const SystemPlanInput = z.object({
	profile: z.string().optional(),
	host: z.string().optional(),
	ref: z.string().optional(),
});
export type SystemPlanInput = z.infer<typeof SystemPlanInput>;

export async function systemPlan(args: SystemPlanInput) {
	const cfg = getConfig();
	if (!cfg.system_repo) throw new Error("system_repo not configured");
	const res = await systemRepoSync({ ref: args.ref, verifySig: true });

	// Use os.hostname() instead of dynamic require
	const hostname = os.hostname();
	const profile = args.profile || cfg.profiles[hostname] || "default";

	// Use the secure repoCacheDir() function instead of manual path construction
	const cacheDir = repoCacheDir();
	const repoName = path.basename(cfg.system_repo.url).replace(/\.git$/, "");
	// Use path.resolve to safely construct path, avoiding traversal issues
	const base = path.resolve(cacheDir, repoName, cfg.system_repo.root, profile);

	const brewfile = path.join(base, "Brewfile");
	const misefile = path.join(base, "mise.toml");
	const plan = await pkgSyncPlan({
		brewfile: fs.existsSync(brewfile) ? brewfile : undefined,
		misefile: fs.existsSync(misefile) ? misefile : undefined,
	});
	const sha = planSha(plan.planned);
	return {
		commit: res.commit,
		plan: plan.planned,
		dotfiles_diff: {},
		plan_sha: sha,
		summary: plan.summary,
	};
}
