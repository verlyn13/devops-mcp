import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	appendAudit,
	checkpointAudit,
	closeAudit,
	initAudit,
} from "../src/lib/audit.js";

describe("audit WAL truncation (native sqlite)", () => {
	it("shrinks WAL after checkpoint", async () => {
		// Only run when native is available
		let hasNative = true;
		try {
			require("better-sqlite3");
		} catch {
			hasNative = false;
		}
		if (!hasNative) return;
		const dir = path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"devops.mcp",
		);
		fs.mkdirSync(dir, { recursive: true });
		const dbp = path.join(dir, "audit.sqlite3");
		try {
			fs.unlinkSync(dbp);
		} catch {}
		try {
			fs.unlinkSync(dbp + "-wal");
		} catch {}
		try {
			initAudit(dbp);
			for (let i = 0; i < 500; i++) {
				appendAudit({
					ts: new Date().toISOString(),
					tool: "waltest",
					args: { i },
					result: { ok: true, summary: "x" },
				});
			}
		} catch (e: any) {
			if (String(e?.message || "").includes("bindings")) return;
			throw e;
		}
		await new Promise((r) => setTimeout(r, 50));
		let before = 0;
		try {
			before = fs.statSync(dbp + "-wal").size;
		} catch {}
		checkpointAudit();
		await new Promise((r) => setTimeout(r, 50));
		let after = 0;
		try {
			after = fs.statSync(dbp + "-wal").size;
		} catch {}
		closeAudit();
		if (before > 0) expect(after).toBeLessThan(before);
	});
});
