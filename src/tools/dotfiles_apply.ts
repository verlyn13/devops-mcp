import { z } from "zod";
import { safeExecFile } from "../lib/exec.js";
import { withFileLock } from "../lib/locks.js";

export const DotfilesApplyInput = z.object({
	profile: z.string().optional(),
	confirm: z.boolean().default(false),
});
export type DotfilesApplyInput = z.infer<typeof DotfilesApplyInput>;

export async function dotfilesApply(args: DotfilesApplyInput) {
	// Always dry-run first for delta
	const dry = await safeExecFile("chezmoi", ["apply", "--dry-run"]);
	let applied = false;
	let code = dry.code;
	if (args.confirm) {
		await withFileLock("dotfiles", async () => {
			const run = await safeExecFile("chezmoi", ["apply"]);
			code = run.code;
			applied = run.code === 0;
		});
	}
	return {
		ok: code === 0,
		applied,
		summary: applied ? "applied" : "planned",
		dryRun: dry.stdout,
	};
}
