import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensureRepo } from "../lib/git.js";

export const PolicyValidateInput = z.object({ ref: z.string().optional() });
export type PolicyValidateInput = z.infer<typeof PolicyValidateInput>;

export async function policyValidate(_args: PolicyValidateInput) {
	// Placeholder: checks pass if policies directory exists
	const { cachePath } = await ensureRepo();
	const polDir = path.join(cachePath, "policies");
	const ok = fs.existsSync(polDir);
	return { checks_passed: ok, violations: ok ? [] : ["no policies directory"] };
}
