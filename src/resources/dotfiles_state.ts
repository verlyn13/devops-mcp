import { z } from "zod";
import { safeExecFile } from "../lib/exec.js";

export const DotfilesState = z.object({
	doctor: z.string().optional(),
	diff: z.string().optional(),
	facts: z.unknown().optional(),
	notes: z.array(z.string()).default([]),
});
export type DotfilesState = z.infer<typeof DotfilesState>;

export async function getDotfilesState(): Promise<DotfilesState> {
	const notes: string[] = [];

	const doctor = await safeExecFile("chezmoi", ["doctor"]);
	if (doctor.code !== 0) notes.push("chezmoi doctor failed or not installed");

	const diff = await safeExecFile("chezmoi", ["diff", "--no-pager"]);
	if (diff.code !== 0) notes.push("chezmoi diff failed or not installed");

	// chezmoi data renders template data; not critical if missing
	const data = await safeExecFile("chezmoi", ["data"]);
	let facts: unknown = undefined;
	if (data.code === 0) {
		try {
			facts = JSON.parse(data.stdout);
		} catch {
			facts = data.stdout.trim();
		}
	} else {
		notes.push("chezmoi data failed or not installed");
	}

	return DotfilesState.parse({
		doctor: doctor.stdout?.trim() || undefined,
		diff: diff.stdout?.trim() || undefined,
		facts,
		notes,
	});
}
