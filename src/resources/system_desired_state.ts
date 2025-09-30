import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import { ensureRepo, headCommit } from "../lib/git.js";

export const DesiredStateInput = z.object({
	profile: z.string().optional(),
	host: z.string().optional(),
	ref: z.string().optional(),
});

export const SystemDesiredState = z.object({
	source: z.object({ commit: z.string(), path: z.string() }),
	brewfile: z.string().optional(),
	mise: z
		.object({
			tools: z.array(z.string()).optional(),
			pins: z.array(z.string()).optional(),
		})
		.optional(),
	policies: z
		.object({
			version: z.string().optional(),
			files: z.array(z.string()).optional(),
		})
		.optional(),
});
export type SystemDesiredState = z.infer<typeof SystemDesiredState>;

export async function getSystemDesiredState(
	args: z.infer<typeof DesiredStateInput>,
): Promise<SystemDesiredState> {
	const cfg = getConfig();
	if (!cfg.system_repo) throw new Error("system_repo not configured");
	const profile =
		args.profile || cfg.profiles[require("node:os").hostname()] || "default";
	const { cachePath } = await ensureRepo(args.ref);
	const commit = await headCommit(cachePath);
	const base = path.join(cachePath, cfg.system_repo.root, profile);
	const brewPath = path.join(base, "Brewfile");
	const misePath = path.join(base, "mise.toml");
	const polDir = path.join(cachePath, "policies");
	const brewfile = fs.existsSync(brewPath)
		? fs.readFileSync(brewPath, "utf8")
		: undefined;
	const mise = fs.existsSync(misePath) ? { tools: [], pins: [] } : undefined;
	const policies = fs.existsSync(polDir)
		? {
				version: "v1",
				files: fs.readdirSync(polDir).map((f) => path.join("policies", f)),
			}
		: undefined;
	return SystemDesiredState.parse({
		source: { commit, path: path.relative(cachePath, base) },
		brewfile,
		mise,
		policies,
	});
}
