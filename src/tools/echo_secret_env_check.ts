import { z } from "zod";
import { safeExecFile } from "../lib/exec.js";

export const EchoSecretEnvInput = z.object({ keys: z.array(z.string()) });
export type EchoSecretEnvInput = z.infer<typeof EchoSecretEnvInput>;

export async function echoSecretEnvCheck(
	args: EchoSecretEnvInput & { secretRefs?: Record<string, string> },
) {
	const envAllow: Record<string, string> = {};
	// pass only keys map; values via secretRefs
	const res = await safeExecFile("env", [], {
		envAllow,
		secretRefs: args.secretRefs,
	});
	const present: string[] = [];
	for (const k of args.keys) {
		if (new RegExp(`^${k}=`, "m").test(res.stdout)) present.push(k);
	}
	return { present };
}
