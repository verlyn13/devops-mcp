import crypto from "node:crypto";
import micromatch from "micromatch";
import { z } from "zod";
import { getConfig } from "../config.js";
import { safeExecFile } from "../lib/exec.js";

export const SecretRefInput = z.object({ path: z.string() });
export type SecretRefInput = z.infer<typeof SecretRefInput>;

export function makeSecretRef(path: string) {
	return `secret://gopass/${path}`;
}

const REF_RE = /^secret:\/\/gopass\/([A-Za-z0-9/_\-.*]+)$/;

function isAllowedGopassPath(p: string): boolean {
	if (p.startsWith("/") || p.includes("..") || p.includes("//")) return false;
	if (p.includes(".git") || p.includes(".gpg-id")) return false;
	const cfg = getConfig();
	const roots: string[] = cfg.secrets.gopass_roots || [];
	if (!roots || roots.length === 0) return false; // deny by default
	return roots.some((pattern) => micromatch.isMatch(p, pattern));
}

export async function resolveSecretRef(ref: string): Promise<string | null> {
	const m = REF_RE.exec(ref);
	if (!m) return null;
	const logical = m[1];
	const start = Date.now();
	if (!isAllowedGopassPath(logical)) {
		try {
			await auditSecretAccess(
				logical,
				"resolveSecretRef",
				false,
				Date.now() - start,
			);
		} catch {}
		return null;
	}
	const res = await safeExecFile("gopass", ["show", "-o", "--", logical], {
		timeoutMs: 2000,
	});
	const ok = res.code === 0;
	try {
		await auditSecretAccess(
			logical,
			"resolveSecretRef",
			ok,
			Date.now() - start,
		);
	} catch {}
	if (!ok) return null;
	return res.stdout.trim();
}

async function auditSecretAccess(
	logical: string,
	tool: string,
	ok: boolean,
	latencyMs?: number,
) {
	const h = crypto.createHash("sha256").update(logical).digest("hex");
	const { appendAudit } = await import("../lib/audit.js");
	appendAudit({
		ts: new Date().toISOString(),
		tool: "secret_access",
		args: { refHash: h, tool },
		result: { ok, summary: ok ? "ok" : "err" },
		latencyMs,
	});
}
