import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function expandTilde(p: string): string {
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	return p;
}

export function normalize(p: string): string {
	return path.normalize(p);
}

export function real(p: string): string {
	return fs.realpathSync(p);
}

export function isWithin(roots: string[], candidate: string): boolean {
	let cand: string;
	try {
		cand = real(candidate);
	} catch {
		return false;
	}
	for (const root of roots) {
		let r = root;
		try {
			r = real(root);
		} catch {
			continue;
		}
		// Ensure segment boundary by adding path.sep
		const rel = path.relative(r, cand);
		if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
		if (cand === r) return true;
	}
	return false;
}

export function defaultDataDir(): string {
	if (process.platform === "darwin")
		return path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"devops.mcp",
		);
	if (process.platform === "win32")
		return path.join(
			process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
			"devops.mcp",
		);
	const xdg =
		process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
	return path.join(xdg, "devops.mcp");
}
