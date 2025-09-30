import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import { ensureRepo, headCommit, verifyHeadSignature } from "../lib/git.js";

export const SystemRepoState = z.object({
	repo_url: z.string(),
	branch: z.string(),
	head_commit: z.string().optional(),
	verified_sig: z.boolean().optional(),
	last_sync_ts: z.number().optional(),
});
export type SystemRepoState = z.infer<typeof SystemRepoState>;

export async function getSystemRepoState(): Promise<SystemRepoState> {
	const cfg = getConfig();
	if (!cfg.system_repo) throw new Error("system_repo not configured");
	const { cachePath } = await ensureRepo();
	const commit = await headCommit(cachePath).catch(() => undefined);
	let verified = false;
	try {
		verified = await verifyHeadSignature(cachePath);
	} catch {}
	let lastSync: number | undefined;
	const marker = path.join(cachePath, ".last_sync");
	if (fs.existsSync(marker))
		lastSync = Number(fs.readFileSync(marker, "utf8")) || undefined;
	return SystemRepoState.parse({
		repo_url: cfg.system_repo.url,
		branch: cfg.system_repo.branch,
		head_commit: commit,
		verified_sig: verified,
		last_sync_ts: lastSync,
	});
}
