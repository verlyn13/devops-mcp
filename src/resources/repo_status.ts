import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import { safeExecFile } from "../lib/exec.js";

export const RepoStatusItem = z.object({
	path: z.string(),
	branch: z.string().optional(),
	ahead: z.number().default(0),
	behind: z.number().default(0),
	dirty: z.boolean(),
	untracked: z.number().default(0),
	modified: z.number().default(0),
});
export const RepoStatus = z.object({
	repos: z.array(RepoStatusItem),
	summary: z.string(),
});
export type RepoStatus = z.infer<typeof RepoStatus>;

function findRepos(root: string): string[] {
	const out: string[] = [];
	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const p = path.join(root, e.name);
		if (fs.existsSync(path.join(p, ".git"))) out.push(p);
	}
	// Also include root itself if it is a repo
	if (fs.existsSync(path.join(root, ".git"))) out.push(root);
	return out;
}

export async function getRepoStatus(): Promise<RepoStatus> {
	const cfg = getConfig();
	const repos: string[] = [];
	for (const ws of cfg.workspaces) {
		try {
			repos.push(...findRepos(ws));
		} catch {}
	}

	const items: z.infer<typeof RepoStatusItem>[] = [];
	for (const r of repos) {
		const res = await safeExecFile(
			"git",
			["-c", "safe.directory=*", "status", "--porcelain=v2", "--branch"],
			{ cwd: r, timeoutMs: 10_000 },
		);
		if (res.code !== 0) continue;
		const lines = res.stdout.split("\n");
		let branch: string | undefined;
		let ahead = 0,
			behind = 0;
		let untracked = 0,
			modified = 0;
		for (const line of lines) {
			if (line.startsWith("# branch.head ")) branch = line.substring(14).trim();
			if (line.startsWith("# branch.ab ")) {
				const m = line.match(/\+([0-9]+) -([0-9]+)/);
				if (m) {
					ahead = Number.parseInt(m[1] || "0", 10);
					behind = Number.parseInt(m[2] || "0", 10);
				}
			}
			if (line.startsWith("? ")) untracked++;
			if (
				line.startsWith("1 ") ||
				line.startsWith("2 ") ||
				line.startsWith("u ")
			)
				modified++;
		}
		items.push({
			path: r,
			branch,
			ahead,
			behind,
			dirty: untracked + modified > 0,
			untracked,
			modified,
		});
	}
	const summary = `repos:${items.length} dirty:${items.filter((i) => i.dirty).length}`;
	return RepoStatus.parse({ repos: items, summary });
}
