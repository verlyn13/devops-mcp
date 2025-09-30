import { z } from "zod";
import { getConfig } from "../config.js";
import { ensureRepo, headCommit, verifyHeadSignature } from "../lib/git.js";

export const RepoSyncInput = z.object({
	ref: z.string().optional(),
	verifySig: z.boolean().default(true),
});
export type RepoSyncInput = z.infer<typeof RepoSyncInput>;

export async function systemRepoSync(args: RepoSyncInput) {
	const cfg = getConfig();
	if (!cfg.system_repo) throw new Error("system_repo not configured");
	const { cachePath } = await ensureRepo(args.ref);
	const commit = await headCommit(cachePath);
	const verified = args.verifySig
		? await verifyHeadSignature(cachePath)
		: false;
	return { commit, verified_sig: verified, summary: `synced ${commit}` };
}
