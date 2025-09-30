import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig } from "../config.js";
import { safeExecFile } from "./exec.js";
import { isWithin } from "./paths.js";

export function validateSystemRepoUrl(
	url: string,
	allowHttps: boolean,
	sshAllowHosts: string[],
): void {
	// Allow SSH forms: git@host:org/repo.git or ssh://git@host/org/repo.git
	const sshLike = /^(git@|ssh:\/\/)/.test(url);
	const httpsLike = /^https:\/\//.test(url);
	if (sshLike) {
		const m = url.match(/^(?:git@|ssh:\/\/[^@]+@)([^/:]+)[:/]/);
		const host = m?.[1] ?? "";
		if (!sshAllowHosts.includes(host)) {
			throw new Error("invalid_repo_url");
		}
	} else if (httpsLike) {
		if (!allowHttps) throw new Error("invalid_repo_url");
	} else {
		throw new Error("invalid_repo_url");
	}
}

export function safeCachePath(cacheDir: string, name: string): string {
	const dest = path.join(cacheDir, name);
	// Ensure within cacheDir and no traversal
	if (!isWithin([cacheDir], dest)) {
		throw new Error("path_traversal");
	}
	return dest;
}

export function repoCacheDir(): string {
	const cfg = getConfig();
	const base = cfg.audit.dir;
	const dir = path.join(base, "repo-cache");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export async function ensureRepo(
	ref?: string,
): Promise<{ cachePath: string; commit?: string }> {
	const cfg = getConfig();
	if (!cfg.system_repo) throw new Error("system_repo not configured");
	validateSystemRepoUrl(
		cfg.system_repo.url,
		cfg.system_repo.allow_https,
		cfg.system_repo.ssh_allow_hosts,
	);
	const cache = repoCacheDir();
	const name = path.basename(cfg.system_repo.url).replace(/\.git$/, "");
	const dest = safeCachePath(cache, name);
	if (!fs.existsSync(dest)) {
		const clone = await safeExecFile(
			"git",
			[
				"clone",
				"--depth",
				"50",
				"-b",
				cfg.system_repo.branch,
				cfg.system_repo.url,
				dest,
			],
			{ timeoutMs: 300_000 },
		);
		if (clone.code !== 0) throw new Error(`git clone failed: ${clone.stderr}`);
	}
	// fetch and checkout ref if provided
	if (ref) {
		const fetch = await safeExecFile(
			"git",
			["fetch", "--depth", "50", "origin", ref],
			{ cwd: dest, timeoutMs: 180_000 },
		);
		if (fetch.code !== 0) throw new Error(`git fetch failed: ${fetch.stderr}`);
		const co = await safeExecFile("git", ["checkout", ref], {
			cwd: dest,
			timeoutMs: 60_000,
		});
		if (co.code !== 0) throw new Error(`git checkout failed: ${co.stderr}`);
	}
	const rev = await safeExecFile("git", ["rev-parse", "HEAD"], {
		cwd: dest,
		timeoutMs: 30_000,
	});
	const commit = rev.stdout.trim();
	// Basic repo layout validation
	try {
		const root = cfg.system_repo.root || "";
		const rootPath = path.join(dest, root);
		const hasBrewfile = fs.existsSync(path.join(rootPath, "Brewfile"));
		const hasMise =
			fs.existsSync(path.join(rootPath, "mise.toml")) ||
			fs.existsSync(path.join(rootPath, ".mise.toml"));
		if (!hasBrewfile && !hasMise) {
			const { childLogger } = await import("../lib/logging/logger.js");
			childLogger({ event: "RepoLayoutInvalid" }).warn(
				{ path: rootPath },
				"invalid repo layout",
			);
			throw new Error("invalid_repo_layout");
		}
	} catch {}
	// write last_sync marker
	fs.writeFileSync(path.join(dest, ".last_sync"), String(Date.now()));
	return { cachePath: dest, commit };
}

export async function verifyHeadSignature(repoPath: string): Promise<boolean> {
	// Best effort: git verify-commit HEAD; treat non-zero as false
	const v = await safeExecFile("git", ["verify-commit", "HEAD"], {
		cwd: repoPath,
		timeoutMs: 10_000,
	});
	return v.code === 0;
}

export async function headCommit(repoPath: string): Promise<string> {
	const rev = await safeExecFile("git", ["rev-parse", "HEAD"], {
		cwd: repoPath,
		timeoutMs: 30_000,
	});
	return rev.stdout.trim();
}

export function pruneRepoCache(days: number): { pruned: number } {
	const cache = repoCacheDir();
	const cutoff = Date.now() - days * 24 * 3600_000;
	let pruned = 0;
	for (const entry of fs.readdirSync(cache)) {
		const p = path.join(cache, entry);
		try {
			const st = fs.statSync(p);
			if (!st.isDirectory()) continue;
			const marker = path.join(p, ".last_sync");
			let ts = st.mtimeMs;
			try {
				const s = fs.readFileSync(marker, "utf8");
				const n = Number(s);
				if (!Number.isNaN(n)) ts = n;
			} catch {}
			if (ts < cutoff) {
				fs.rmSync(p, { recursive: true, force: true });
				pruned++;
			}
		} catch {}
	}
	return { pruned };
}
