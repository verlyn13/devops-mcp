import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { safeExecFile } from "../lib/exec.js";

export const PatchApplyInput = z.object({
	repo: z.string(),
	unifiedDiff: z.string(),
	reverse: z.boolean().optional().default(false),
	checkOnly: z.boolean().optional().default(true),
});
export type PatchApplyInput = z.infer<typeof PatchApplyInput>;

export async function patchApplyCheck(args: PatchApplyInput) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devops-mcp-"));
	const diffPath = path.join(tmpDir, "patch.diff");
	fs.writeFileSync(diffPath, args.unifiedDiff);
	const flags = ["apply", "--check"];
	if (args.reverse) flags.push("-R");
	flags.push(diffPath);
	const res = await safeExecFile("git", flags, { cwd: args.repo });
	return {
		ok: res.code === 0,
		code: res.code,
		stderr: res.stderr,
	};
}
