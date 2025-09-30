import crypto from "node:crypto";

export function planSha(obj: unknown): string {
	const s = JSON.stringify(obj);
	return crypto.createHash("sha256").update(s).digest("hex");
}
