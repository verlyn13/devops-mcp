import { z } from "zod";
import { appendAuditId } from "../lib/audit.js";
import { withFileLock } from "../lib/locks.js";
import { dotfilesApply } from "./dotfiles_apply.js";
import { type PkgPlan, pkgSyncApply } from "./pkg_sync.js";
import { policyValidate } from "./policy_validate.js";
import { systemPlan } from "./system_plan.js";
import { systemRepoSync } from "./system_repo_sync.js";

export const SystemConvergeInput = z.object({
	profile: z.string().optional(),
	host: z.string().optional(),
	ref: z.string().optional(),
	confirm: z.boolean().default(false),
});
export type SystemConvergeInput = z.infer<typeof SystemConvergeInput>;

export async function systemConverge(args: SystemConvergeInput) {
	const steps: any = {};
	const sync = await systemRepoSync({ ref: args.ref, verifySig: true });
	steps.repo_sync = sync;
	const pol = await policyValidate({ ref: args.ref });
	steps.policy_validate = pol;
	if (!pol.checks_passed)
		return { steps, aborted: true, reason: "policy_failed" };
	const pl = await systemPlan({
		profile: args.profile,
		host: args.host,
		ref: args.ref,
	});
	steps.plan = { commit: pl.commit, summary: pl.summary };
	let pkgAuditId: string | undefined;
	let dotAuditId: string | undefined;
	let applied: { ok: boolean; residual?: unknown } | undefined;
	if (args.confirm) {
		const plan: PkgPlan = pl.plan as PkgPlan;
		applied = await withFileLock("pkg", async () =>
			pkgSyncApply({ plan, confirm: true }),
		);
		pkgAuditId = appendAuditId({
			ts: new Date().toISOString(),
			tool: "system_converge",
			args: {
				action: "pkg_sync_apply",
				commit: sync.commit,
				plan_sha: pl.plan_sha,
			},
			result: { ok: applied.ok, summary: "applied" },
		});
		steps.pkg_apply = {
			ok: applied.ok,
			audit_id: pkgAuditId,
			residual: applied.residual,
		};
		if (!applied.ok)
			return { steps, aborted: true, reason: "pkg_apply_failed" };
		const dout = await withFileLock("dotfiles", async () =>
			dotfilesApply({ confirm: true }),
		);
		dotAuditId = appendAuditId({
			ts: new Date().toISOString(),
			tool: "system_converge",
			args: { action: "dotfiles_apply", commit: sync.commit },
			result: { ok: dout.ok, summary: dout.summary },
		});
		steps.dotfiles_apply = { ok: dout.ok, audit_id: dotAuditId };
	}
	return { steps, aborted: false, commit: sync.commit };
}
