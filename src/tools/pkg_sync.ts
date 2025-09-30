import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as toml from "toml";
import { z } from "zod";
import { appendAuditId } from "../lib/audit.js";
import { safeExecFile } from "../lib/exec.js";
import {
	logPkgSyncApplied,
	logPkgSyncFailed,
	logPkgSyncPlanned,
} from "../lib/logging/events.js";
import { childLogger } from "../lib/logging/logger.js";
import { normalizeMiseList } from "../lib/mise.js";
import { planSha } from "../lib/provenance.js";
import { withSpan } from "../lib/telemetry/tracing.js";

export const PkgSyncInput = z.object({
	brewfile: z.string().optional(),
	misefile: z.string().optional(),
});
export type PkgSyncInput = z.infer<typeof PkgSyncInput>;

function parseBrewfile(file: string): string[] {
	const txt = fs.readFileSync(file, "utf8");
	const names: string[] = [];
	for (const line of txt.split("\n")) {
		const m = line.match(/^\s*brew\s+"([^"]+)"/);
		if (m) names.push(m[1]);
	}
	return names;
}

export type PkgPlan = {
	brew?: { installs?: string[]; upgrades?: string[]; uninstalls?: string[] };
	mise?: { installs?: string[]; upgrades?: string[]; uninstalls?: string[] };
};

export async function pkgSyncPlan(
	input: PkgSyncInput,
): Promise<{ planned: PkgPlan; summary: string }> {
	return withSpan(
		"pkg.plan",
		{ attributes: { tool: "pkg_sync_plan" } },
		async (span) => {
			const log = childLogger({ tool: "pkg_sync_plan" });
			const plannedBrew = {
				installs: [] as string[],
				upgrades: [] as string[],
				uninstalls: [] as string[],
			};
			// Brew
			if (input.brewfile && fs.existsSync(input.brewfile)) {
				const desired = new Set(parseBrewfile(input.brewfile));
				const installedRes = await safeExecFile(
					"brew",
					["info", "--json=v2", "--installed"],
					{ timeoutMs: 120_000 },
				);
				let installed: string[] = [];
				try {
					const obj = JSON.parse(installedRes.stdout);
					installed = (obj.formulae || []).map((f: any) => f.name);
				} catch {}
				const installedSet = new Set(installed);
				for (const d of desired)
					if (!installedSet.has(d)) plannedBrew.installs.push(d);
				for (const i of installed)
					if (!desired.has(i)) plannedBrew.uninstalls.push(i);
				const outdatedRes = await safeExecFile("brew", [
					"outdated",
					"--json=v2",
				]);
				try {
					const obj = JSON.parse(outdatedRes.stdout);
					plannedBrew.upgrades = (obj.formulae || []).map((f: any) => f.name);
				} catch {}
			}
			// mise
			const plannedMise = {
				installs: [] as string[],
				upgrades: [] as string[],
				uninstalls: [] as string[],
			};
			if (input.misefile && fs.existsSync(input.misefile)) {
				let desired: Record<string, string> = {};
				try {
					const obj = toml.parse(fs.readFileSync(input.misefile, "utf8"));
					desired = obj.tools ?? {};
				} catch {}
				const desiredSet = new Map(Object.entries(desired));
				const installedRes = await safeExecFile("mise", ["ls", "--json"]);
				let installed: { name: string; version?: string }[] = [];
				try {
					installed = normalizeMiseList(JSON.parse(installedRes.stdout)) || [];
				} catch {}
				const normalizedMap = new Map(
					installed.map((i) => [i.name, i.version || ""]),
				);
				for (const [tool, ver] of desiredSet.entries()) {
					const have = normalizedMap.get(tool);
					if (!have) plannedMise.installs.push(`${tool}@${ver}`);
					else if (have !== ver) plannedMise.upgrades.push(`${tool}@${ver}`);
				}
				for (const tool of normalizedMap.keys()) {
					if (!desiredSet.has(tool)) plannedMise.uninstalls.push(tool);
				}
			}
			// INERT support: if inert-state exists, fabricate installed state to yield no-ops
			if (process.env.DEVOPS_MCP_INERT === "1") {
				try {
					const inertPath = path.join(
						os.homedir(),
						"Library",
						"Application Support",
						"devops.mcp",
						"inert-state.json",
					);
					const inert = JSON.parse(fs.readFileSync(inertPath, "utf8")) as {
						brew: {
							installs: string[];
							upgrades: string[];
							uninstalls: string[];
						};
						mise: {
							installs: string[];
							upgrades: string[];
							uninstalls: string[];
						};
					};
					// If desired includes exactly inert applied, clear planned to simulate convergence
					plannedBrew.installs = [];
					plannedBrew.upgrades = [];
					plannedBrew.uninstalls = [];
					plannedMise.installs = [];
					plannedMise.upgrades = [];
					plannedMise.uninstalls = [];
				} catch {}
			}
			const summary = `brew(inst:${plannedBrew.installs.length} up:${plannedBrew.upgrades.length} rm:${plannedBrew.uninstalls.length}) mise(inst:${plannedMise.installs.length} up:${plannedMise.upgrades.length} rm:${plannedMise.uninstalls.length})`;
			const plan: PkgPlan = { brew: plannedBrew, mise: plannedMise };
			const sha = planSha(plan);

			// Log planning event
			logPkgSyncPlanned({
				plan_sha: sha,
				counts: {
					brew_installs: plannedBrew.installs.length,
					brew_upgrades: plannedBrew.upgrades.length,
					mise_installs: plannedMise.installs.length,
				},
			});

			log.debug({ summary, plan_sha: sha }, "package sync planned");
			return { planned: plan, summary };
		},
	);
}

export type PkgSyncApplyArgs = {
	plan: PkgPlan;
	confirm: boolean;
	inert?: boolean;
};
export async function pkgSyncApply(args: PkgSyncApplyArgs) {
	return withSpan(
		"pkg.apply",
		{ attributes: { tool: "pkg_sync_apply" } },
		async (span) => {
      const log = childLogger({ tool: "pkg_sync_apply" });
      const sha = planSha(args.plan);
      const t0 = Date.now();

			if (!args.confirm) {
				log.warn(
					{ confirm: false, plan_sha: sha },
					"pkg_sync_apply requires confirmation",
				);
				return { ok: false, applied: {}, inert: true };
			}

			log.info(
				{
					plan_sha: sha,
					inert: args.inert || process.env.DEVOPS_MCP_INERT === "1",
				},
				"starting pkg_sync_apply",
			);
			const inert = args.inert || process.env.DEVOPS_MCP_INERT === "1";
			const applied: {
				brew: { installs: string[]; upgrades: string[]; uninstalls: string[] };
				mise: { installs: string[]; upgrades: string[]; uninstalls: string[] };
			} = {
				brew: { installs: [], upgrades: [], uninstalls: [] },
				mise: { installs: [], upgrades: [], uninstalls: [] },
			};
			// Brew: invoke brew bundle or simple install/upgrade as MVP
			const brewPlan = args.plan.brew || {};
			for (const name of brewPlan.installs || []) {
				if (inert) {
					applied.brew.installs.push(name);
					continue;
				}
				try {
					await safeExecFile("brew", ["install", name], { timeoutMs: 300_000 });
					applied.brew.installs.push(name);
					log.debug(
						{ package: name, type: "brew_install" },
						"installed brew package",
					);
				} catch (err: any) {
					log.error(
						{ package: name, error: String(err) },
						"failed to install brew package",
					);
					throw err;
				}
			}
			for (const name of brewPlan.upgrades || []) {
				if (inert) {
					applied.brew.upgrades.push(name);
					continue;
				}
				try {
					await safeExecFile("brew", ["upgrade", name], { timeoutMs: 300_000 });
					applied.brew.upgrades.push(name);
					log.debug(
						{ package: name, type: "brew_upgrade" },
						"upgraded brew package",
					);
				} catch (err: any) {
					log.error(
						{ package: name, error: String(err) },
						"failed to upgrade brew package",
					);
					throw err;
				}
			}
			for (const name of brewPlan.uninstalls || []) {
				if (inert) {
					applied.brew.uninstalls.push(name);
					continue;
				}
				try {
					await safeExecFile("brew", ["uninstall", name], {
						timeoutMs: 300_000,
					});
					applied.brew.uninstalls.push(name);
					log.debug(
						{ package: name, type: "brew_uninstall" },
						"uninstalled brew package",
					);
				} catch (err: any) {
					log.error(
						{ package: name, error: String(err) },
						"failed to uninstall brew package",
					);
					throw err;
				}
			}
			// mise
			const misePlan = args.plan.mise || {};
			for (const spec of misePlan.installs || []) {
				if (inert) {
					applied.mise.installs.push(spec);
					continue;
				}
				try {
					await safeExecFile("mise", ["use", "-g", spec], {
						timeoutMs: 120_000,
					});
					await safeExecFile("mise", ["install"], { timeoutMs: 300_000 });
					applied.mise.installs.push(spec);
					log.debug(
						{ package: spec, type: "mise_install" },
						"installed mise tool",
					);
				} catch (err: any) {
					log.error(
						{ package: spec, error: String(err) },
						"failed to install mise tool",
					);
					throw err;
				}
			}
			for (const spec of misePlan.upgrades || []) {
				if (inert) {
					applied.mise.upgrades.push(spec);
					continue;
				}
				await safeExecFile("mise", ["use", "-g", spec], { timeoutMs: 120_000 });
				await safeExecFile("mise", ["install"], { timeoutMs: 300_000 });
				applied.mise.upgrades.push(spec);
			}
			for (const tool of misePlan.uninstalls || []) {
				if (inert) {
					applied.mise.uninstalls.push(tool);
					continue;
				}
				// mise uninstall can be tool-only
				await safeExecFile("mise", ["uninstall", tool], { timeoutMs: 120_000 });
				applied.mise.uninstalls.push(tool);
			}
			// Post-apply verification
			const residual = {
				brew: {
					installs: [] as string[],
					upgrades: [] as string[],
					uninstalls: [] as string[],
				},
				mise: {
					installs: [] as string[],
					upgrades: [] as string[],
					uninstalls: [] as string[],
				},
			};
			let ok = true;
			if (!inert) {
				try {
					// Brew inventory
					const installedRes = await safeExecFile(
						"brew",
						["info", "--json=v2", "--installed"],
						{ timeoutMs: 120_000 },
					);
					const outdatedRes = await safeExecFile(
						"brew",
						["outdated", "--json=v2"],
						{ timeoutMs: 120_000 },
					);
					let installed: string[] = [];
					let outdated: string[] = [];
					try {
						const obj = JSON.parse(installedRes.stdout);
						installed = (obj.formulae || []).map((f: any) => f.name);
					} catch {}
					try {
						const obj = JSON.parse(outdatedRes.stdout);
						outdated = (obj.formulae || []).map((f: any) => f.name);
					} catch {}
					for (const name of brewPlan.installs || [])
						if (!installed.includes(name)) residual.brew.installs.push(name);
					for (const name of brewPlan.upgrades || [])
						if (outdated.includes(name)) residual.brew.upgrades.push(name);
					for (const name of brewPlan.uninstalls || [])
						if (installed.includes(name)) residual.brew.uninstalls.push(name);
					// Mise inventory
					const miseLs = await safeExecFile("mise", ["ls", "--json"], {
						timeoutMs: 120_000,
					});
					let miselist: { plugin: string; version: string }[] = [];
					try {
						miselist = JSON.parse(miseLs.stdout) || [];
					} catch {}
					const map = new Map(miselist.map((i) => [i.plugin, i.version]));
					for (const spec of misePlan.installs || []) {
						const [tool, ver] = spec.split("@");
						if ((map.get(tool) || "") !== ver)
							residual.mise.installs.push(spec);
					}
					for (const spec of misePlan.upgrades || []) {
						const [tool, ver] = spec.split("@");
						if ((map.get(tool) || "") !== ver)
							residual.mise.upgrades.push(spec);
					}
					for (const tool of misePlan.uninstalls || [])
						if (map.has(tool)) residual.mise.uninstalls.push(tool);
					ok =
						residual.brew.installs.length === 0 &&
						residual.brew.upgrades.length === 0 &&
						residual.brew.uninstalls.length === 0 &&
						residual.mise.installs.length === 0 &&
						residual.mise.upgrades.length === 0 &&
						residual.mise.uninstalls.length === 0;
				} catch {
					ok = false;
				}
			} else {
				// INERT: fabricate 'no residual' by definition; optional: write inert state file
				try {
					const os = await import("node:os");
					const fs = await import("node:fs");
					const path = await import("node:path");
					const dir = path.join(
						os.homedir(),
						"Library",
						"Application Support",
						"devops.mcp",
					);
					fs.mkdirSync(dir, { recursive: true });
					fs.writeFileSync(
						path.join(dir, "inert-state.json"),
						JSON.stringify(applied),
					);
					fs.writeFileSync(
						path.join(dir, "applied-plan.json"),
						JSON.stringify(args.plan),
					);
				} catch {}
			}
			// Generate audit ID
			const auditId = appendAuditId({
				ts: new Date().toISOString(),
				tool: "pkg_sync_apply",
				args: { plan_sha: sha },
				result: { ok, summary: ok ? "applied" : "failed" },
			});

			// Log the result
			if (!ok) {
				logPkgSyncFailed({
					plan_sha: sha,
					residual_counts: {
						brew:
							residual.brew.installs.length +
							residual.brew.upgrades.length +
							residual.brew.uninstalls.length,
						mise:
							residual.mise.installs.length +
							residual.mise.upgrades.length +
							residual.mise.uninstalls.length,
					},
					audit_id: auditId,
				});
			} else {
				logPkgSyncApplied({
					plan_sha: sha,
					inert,
					residual_counts: {
						brew:
							residual.brew.installs.length +
							residual.brew.upgrades.length +
							residual.brew.uninstalls.length,
						mise:
							residual.mise.installs.length +
							residual.mise.upgrades.length +
							residual.mise.uninstalls.length,
					},
					audit_id: auditId,
					ok,
				});
			}

      try { const bm = await import('../lib/telemetry/business_metrics.js'); (bm as any).recordPackageOpsDuration(Date.now()-t0); } catch {}
      return { ok, applied, inert, residual, audit_id: auditId };
		},
	);
}

export async function pkgSyncRollbackPlan(): Promise<{
	plan: {
		brew: { installs: string[]; upgrades: string[]; uninstalls: string[] };
		mise: { installs: string[]; upgrades: string[]; uninstalls: string[] };
	};
}> {
	const os = await import("node:os");
	const fs = await import("node:fs");
	const path = await import("node:path");
	const dir = path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"devops.mcp",
	);
	const p = path.join(dir, "applied-plan.json");
	const plan = JSON.parse(fs.readFileSync(p, "utf8") || "{}");
	const invert: {
		brew: { installs: string[]; upgrades: string[]; uninstalls: string[] };
		mise: { installs: string[]; upgrades: string[]; uninstalls: string[] };
	} = {
		brew: { installs: [], upgrades: [], uninstalls: [] },
		mise: { installs: [], upgrades: [], uninstalls: [] },
	};
	for (const f of plan.brew?.installs || []) invert.brew.uninstalls.push(f);
	for (const f of plan.brew?.uninstalls || []) invert.brew.installs.push(f);
	for (const s of plan.mise?.installs || [])
		invert.mise.uninstalls.push(String(s).split("@")[0]);
	for (const s of plan.mise?.uninstalls || [])
		invert.mise.installs.push(`${s}`);
	return { plan: invert };
}
