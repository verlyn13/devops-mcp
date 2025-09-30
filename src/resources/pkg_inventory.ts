import { z } from "zod";
import { safeExecFile } from "../lib/exec.js";
import { normalizeMiseList } from "../lib/mise.js";

export const PkgInventory = z.object({
	brew: z.object({
		installed: z.any().array().optional(),
		outdated: z.any().array().optional(),
	}),
	mise: z.object({
		installed: z.any().array().optional(),
		outdated: z.any().array().optional(),
	}),
	summary: z.string(),
});
export type PkgInventory = z.infer<typeof PkgInventory>;

export async function getPkgInventory(): Promise<PkgInventory> {
	const brewInstalled = await safeExecFile(
		"brew",
		["info", "--json=v2", "--installed"],
		{ timeoutMs: 120_000 },
	);
	const brewOutdated = await safeExecFile("brew", ["outdated", "--json=v2"], {
		timeoutMs: 120_000,
	});
	const miseInstalled = await safeExecFile("mise", ["ls", "--json"], {
		timeoutMs: 60_000,
	});
	const miseOutdated = await safeExecFile("mise", ["outdated", "--json"], {
		timeoutMs: 60_000,
	});

	let installedBrew: any[] | undefined;
	let outdatedBrew: any[] | undefined;
	try {
		installedBrew = JSON.parse(brewInstalled.stdout).formulae ?? [];
	} catch {}
	try {
		outdatedBrew = JSON.parse(brewOutdated.stdout).formulae ?? [];
	} catch {}

	let installedMise: any[] | undefined;
	let outdatedMise: any[] | undefined;
	try {
		installedMise = normalizeMiseList(JSON.parse(miseInstalled.stdout));
	} catch {
		installedMise = [];
	}
	try {
		outdatedMise = normalizeMiseList(JSON.parse(miseOutdated.stdout));
	} catch {
		outdatedMise = [];
	}

	const summary = `brew(installed:${installedBrew?.length ?? 0}, outdated:${outdatedBrew?.length ?? 0}) mise(installed:${installedMise?.length ?? 0}, outdated:${outdatedMise?.length ?? 0})`;

	return PkgInventory.parse({
		brew: { installed: installedBrew, outdated: outdatedBrew },
		mise: { installed: installedMise, outdated: outdatedMise },
		summary,
	});
}
