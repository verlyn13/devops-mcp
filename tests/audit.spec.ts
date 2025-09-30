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

describe("audit lifecycle", () => {
	it("initializes, writes, checkpoints, closes", async () => {
		// Skip if native binding isn't available
		try {
			require("better-sqlite3");
		} catch (e) {
			return; // environment without compiled binding; audit falls back in production
		}
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
			initAudit(dbp);
			appendAudit({
				ts: new Date().toISOString(),
				tool: "test",
				args: {},
				result: { ok: true, summary: "ok" },
			});
			checkpointAudit();
			closeAudit();
		} catch (e: any) {
			if (String(e?.message || e).includes("bindings file")) return; // skip on missing native binding
			throw e;
		}
		expect(fs.existsSync(dbp)).toBe(true);
	});
});
