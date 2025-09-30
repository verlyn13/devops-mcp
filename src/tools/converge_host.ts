import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getConfig } from "../config.js";
import { appendAuditId } from "../lib/audit.js";
import { withFileLock } from "../lib/locks.js";
import {
	logConvergeAborted,
	logConvergeApplied,
	logConvergePlanned,
} from "../lib/logging/events.js";
import { logSLOBreach } from "../lib/logging/events.js";
import { childLogger } from "../lib/logging/logger.js";
import { withSpan } from "../lib/telemetry/tracing.js";
import { incTool, incToolError, observeToolDuration } from "../lib/telemetry/metrics.js";
import { setRunContext, clearRunContext, withRunContext } from "../lib/telemetry/run_context.js";
import { getProfileAttributes } from "../lib/telemetry/profile_context.js";
import { recordConvergenceOutcome, recordPackageOpsDuration, incDotfilesChanges, recordRunDuration } from "../lib/telemetry/business_metrics.js";
import { getDotfilesState } from "../resources/dotfiles_state.js";
import { getPkgInventory } from "../resources/pkg_inventory.js";
import { getRepoStatus } from "../resources/repo_status.js";
import { DotfilesApplyInput, dotfilesApply } from "./dotfiles_apply.js";
import { type PkgPlan, pkgSyncApply, pkgSyncPlan } from "./pkg_sync.js";

export const ConvergeInput = z.object({
	brewfile: z.string().optional(),
	misefile: z.string().optional(),
	confirm: z.boolean().default(false),
	includeRepos: z.boolean().default(false),
	cancelAfterMs: z.number().optional(),
});

export async function convergeHost(args: z.infer<typeof ConvergeInput>) {
	return withSpan(
		"converge.host",
		{ attributes: { tool: "converge_host", profile: "local" } },
		async (span) => {
			const log = childLogger({ tool: "converge_host", profile: "local" });
    const t0 = Date.now();
    const profAttrs = getProfileAttributes('local');
    const run_id = randomUUID();
    try { setRunContext({ run_id, profile: 'local' }); incTool('converge_host', profAttrs); } catch {}
			const deadline = args.cancelAfterMs ? t0 + args.cancelAfterMs : undefined;
			const steps: Record<string, any> = {};

			if (deadline && Date.now() > deadline) {
      log.warn(
        { reason: "cancelled", step: "pre-plan" },
        "converge cancelled",
      );
      try { incToolError('converge_host', 'cancelled', profAttrs); observeToolDuration('converge_host', Date.now() - t0, profAttrs); } catch {}
      return {
					steps,
					aborted: true,
					reason: "cancelled",
					summary: "Cancelled before planning",
				};
			}

			const plan = await pkgSyncPlan({
				brewfile: args.brewfile,
				misefile: args.misefile,
			});
			steps.plan = { summary: plan.summary };

			// Log the planning event
  logConvergePlanned({
    profile: "local",
    plan_sha: "", // Would need to compute this from plan
    run_id,
				counts: {
					brew_installs: plan.planned?.brew?.installs?.length || 0,
					brew_upgrades: plan.planned?.brew?.upgrades?.length || 0,
					mise_installs: plan.planned?.mise?.installs?.length || 0,
					dotfiles_changes: 0,
				},
			});
			if (deadline && Date.now() > deadline) {
				log.warn(
					{ reason: "cancelled", step: "pre-dotfiles" },
					"converge cancelled",
				);
				return {
					steps,
					aborted: true,
					reason: "cancelled",
					summary: "Cancelled before dotfiles_state",
				};
			}
			const dots = await getDotfilesState();
			steps.dotfiles_state = { notes: dots.notes?.length || 0 };

			if (args.includeRepos) {
				if (deadline && Date.now() > deadline) {
        log.warn(
          { reason: "cancelled", step: "pre-repos" },
          "converge cancelled",
        );
        try { incToolError('converge_host', 'cancelled', profAttrs); observeToolDuration('converge_host', Date.now() - t0, profAttrs); } catch {}
        return {
						steps,
						aborted: true,
						reason: "cancelled",
						summary: "Cancelled before repo_status",
					};
				}
				const repos = await getRepoStatus();
				steps.repo_status = { summary: repos.summary };
			}

			let pkgApply:
				| {
						ok: boolean;
						inert?: boolean;
						residual?: unknown;
						error_kind?: string;
				  }
				| undefined;
			let appliedAuditId: string | undefined;
			let dotfilesAuditId: string | undefined;
			if (args.confirm) {
      // package phase with single retry on transient failure
      const doPkg = async () =>
        withRunContext({ run_id, profile: 'local' }, async () =>
          withFileLock("pkg", async () =>
            pkgSyncApply({ plan: plan.planned as PkgPlan, confirm: true }),
          )
        );

				try {
					pkgApply = await doPkg();
					if (!pkgApply.ok && !pkgApply.inert) {
						// retry once
						log.warn(
							{ attempt: 1, error_kind: pkgApply.error_kind },
							"pkg_apply transient failure, retrying",
						);
						pkgApply = await doPkg();
					}
				} catch (err: any) {
					log.error(
						{ err: String(err), step: "pkg_apply" },
						"pkg_apply exception",
					);
					throw err;
				}

				appliedAuditId = appendAuditId({
					ts: new Date().toISOString(),
					tool: "converge_host",
					args: { action: "pkg_sync_apply" },
					result: { ok: pkgApply.ok, summary: "applied" },
				});
				steps.pkg_apply = {
					ok: pkgApply.ok,
					audit_id: appliedAuditId,
					residual: pkgApply.residual,
				};

				if (!pkgApply.ok) {
        logConvergeAborted({
          reason: "pkg_apply_failed",
          step: "pkg",
          error_kind: pkgApply.error_kind,
          audit_ids: { pkg: appliedAuditId },
          run_id,
        });
        try { incToolError('converge_host', 'pkg_apply_failed', profAttrs); } catch {}
        return {
          steps,
          aborted: true,
          reason: "pkg_apply_failed",
						summary: "Aborted before dotfiles_apply due to package residuals",
					};
				}

				if (deadline && Date.now() > deadline) {
        log.warn(
          { reason: "cancelled", step: "pre-dotfiles-apply" },
          "converge cancelled",
        );
        try { incToolError('converge_host', 'cancelled', profAttrs); observeToolDuration('converge_host', Date.now() - t0, profAttrs); } catch {}
        return {
						steps,
						aborted: true,
						reason: "cancelled",
						summary: "Cancelled before dotfiles_apply",
					};
				}

				const dotout = await withFileLock("dotfiles", async () =>
					dotfilesApply({ confirm: true }),
				);
				dotfilesAuditId = appendAuditId({
					ts: new Date().toISOString(),
					tool: "converge_host",
					args: { action: "dotfiles_apply" },
					result: { ok: dotout.ok, summary: dotout.summary },
				});
        steps.dotfiles_apply = { ok: dotout.ok, audit_id: dotfilesAuditId };
        try { if (dotout.ok) { const bm = await import('../lib/telemetry/business_metrics.js'); (bm as any).incDotfilesChanges(1, 'local'); } } catch {}

				// Log successful convergence
				const len = (x: unknown): number => (Array.isArray(x) ? x.length : 0);
				const get = (o: unknown, k: string): unknown =>
					o && typeof o === "object" && k in (o as Record<string, unknown>)
						? (o as Record<string, unknown>)[k]
						: undefined;
				const brewObj = get(pkgApply?.residual, "brew");
				const miseObj = get(pkgApply?.residual, "mise");
				const residual_counts = {
					brew:
						len(get(brewObj, "installs")) +
						len(get(brewObj, "upgrades")) +
						len(get(brewObj, "uninstalls")),
					mise:
						len(get(miseObj, "installs")) +
						len(get(miseObj, "upgrades")) +
						len(get(miseObj, "uninstalls")),
					dotfiles: 0,
				};
      const appliedEvent = {
        profile: "local",
        audit_ids: { pkg: appliedAuditId, dotfiles: dotfilesAuditId },
        residual_counts,
        ok: dotout.ok,
      } as const;
      logConvergeApplied({ ...appliedEvent, run_id });
      try { recordPackageOpsDuration(Date.now() - t0, 'local'); } catch {}
      try {
        const residualTotal = residual_counts.brew + residual_counts.mise + residual_counts.dotfiles;
        recordConvergenceOutcome(!!dotout.ok, 'local', residualTotal);
      } catch {}
				// SLO checks
				try {
					const cfg = getConfig();
					const dur = Date.now() - t0;
					const residualTotal =
						residual_counts.brew +
						residual_counts.mise +
						residual_counts.dotfiles;
					const plannedTotal =
						(plan.planned?.brew?.installs?.length || 0) +
						(plan.planned?.brew?.upgrades?.length || 0) +
						(plan.planned?.brew?.uninstalls?.length || 0) +
						(plan.planned?.mise?.installs?.length || 0) +
						(plan.planned?.mise?.upgrades?.length || 0) +
						(plan.planned?.mise?.uninstalls?.length || 0);
					const pct =
						plannedTotal > 0 ? (residualTotal / plannedTotal) * 100 : 0;
        if (pct > cfg.slos.maxResidualPctAfterApply) {
          logSLOBreach({
            slo: "maxResidualPctAfterApply",
            value: pct,
            threshold: cfg.slos.maxResidualPctAfterApply,
            audit_ids: { pkg: appliedAuditId, dotfiles: dotfilesAuditId },
            run_id,
          });
        }
        if (dur > cfg.slos.maxConvergeDurationMs) {
          logSLOBreach({
            slo: "maxConvergeDurationMs",
            value: dur,
            threshold: cfg.slos.maxConvergeDurationMs,
            audit_ids: { pkg: appliedAuditId, dotfiles: dotfilesAuditId },
            run_id,
          });
        }
				} catch (e) {
					try {
						const err = e instanceof Error ? e.message : String(e);
						log.warn({ error: err }, "slo_calc_failed");
					} catch {}
				}
			} else {
				log.info({ confirm: false }, "dry-run only");
			}
    const summary = args.confirm
      ? pkgApply?.ok
        ? "Converged; no residuals"
        : "Aborted"
      : "Planned (dry-run)";
    try { observeToolDuration('converge_host', Date.now() - t0, profAttrs); recordRunDuration(Date.now()-t0, 'local', run_id); } catch {}
    try { clearRunContext(); } catch {}
    return { steps, aborted: false, summary, run_id };
		},
	);
}
