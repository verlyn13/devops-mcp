import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
	pruneRepoCache,
	repoCacheDir,
	safeCachePath,
	validateSystemRepoUrl,
} from "../src/lib/git.js";

describe("repo authority and cache safety", () => {
	it("rejects invalid repo URLs by policy", () => {
		expect(() =>
			validateSystemRepoUrl("file:///etc/passwd", false, ["github.com"]),
		).toThrowError("invalid_repo_url");
		expect(() =>
			validateSystemRepoUrl("https://example.com/org/repo.git", false, [
				"github.com",
			]),
		).toThrowError("invalid_repo_url");
		expect(() =>
			validateSystemRepoUrl("git@evil.com:org/repo.git", true, ["github.com"]),
		).toThrowError("invalid_repo_url");
		expect(() =>
			validateSystemRepoUrl("git@github.com:org/repo.git", true, [
				"github.com",
			]),
		).not.toThrow();
	});

	it("prevents path traversal out of cache dir", () => {
		const cache = repoCacheDir();
		expect(() => safeCachePath(cache, "../escape")).toThrowError(
			"path_traversal",
		);
	});

	it("prunes stale cache entries older than cutoff", () => {
		const cache = repoCacheDir();
		const oldDir = path.join(cache, "old");
		const newDir = path.join(cache, "new");
		fs.mkdirSync(oldDir, { recursive: true });
		fs.mkdirSync(newDir, { recursive: true });
		fs.writeFileSync(
			path.join(oldDir, ".last_sync"),
			String(Date.now() - 20 * 24 * 3600_000),
		);
		fs.writeFileSync(path.join(newDir, ".last_sync"), String(Date.now()));
		const { pruned } = pruneRepoCache(14);
		expect(pruned).toBeGreaterThanOrEqual(1);
	});
});
