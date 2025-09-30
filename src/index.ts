import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getConfig } from "./config.js";
import { appendAudit, checkpointAudit, closeAudit, initAudit, retain, vacuumAudit } from "./lib/audit.js";
import { logger } from "./lib/logging/logger.js";
import { incTool, incToolError, observeToolDuration } from "./lib/telemetry/metrics.js";
import { getProfileAttributes } from "./lib/telemetry/profile_context.js";
import { allow as rlAllow } from "./lib/ratelimit.js";
import { TELEMETRY_CONTRACT } from "./lib/telemetry/contract.js";
import { getDotfilesState } from "./resources/dotfiles_state.js";
import { getPkgInventory } from "./resources/pkg_inventory.js";
import { getPolicyManifest } from "./resources/policy_manifest.js";
import { getRepoStatus } from "./resources/repo_status.js";
import { createRequire } from "node:module";

const SERVER_NAME = "devops.local";
const SERVER_VERSION = "0.3.0";

async function main() {
	// Telemetry init
	try {
		const { initTelemetry } = await import("./lib/telemetry/otel.js");
		const cfg = getConfig();
		initTelemetry({
			enabled: cfg.telemetry.enabled,
			endpoint: cfg.telemetry.endpoint,
			protocol: cfg.telemetry.protocol as "grpc" | "http",
			sampleRatio: cfg.telemetry.sample_ratio ?? 1.0,
			serviceName: "devops-mcp",
			serviceVersion: SERVER_VERSION,
		});
	} catch {}
	// If OTLP log export requested but exporter module is missing, emit one info line
	try {
		const cfg = getConfig();
		if (cfg.telemetry.export === "otlp") {
			try {
				const req = createRequire(import.meta.url);
				req.resolve("@opentelemetry/exporter-logs-otlp-http");
			} catch {
				logger().info(
					{
						event: "LogExport",
						kind: "otlp",
						status: "unavailable",
						reason: "exporter module missing; using JSON stderr/file",
					},
					"otlp log export unavailable",
				);
			}
		}
	} catch {}
	// Startup banner (structured)
	try {
		const cfg = getConfig();
		const { getReachability } = await import("./lib/telemetry/health.js");
		const tel = getReachability();
		logger().info(
			{
				event: "ServiceStart",
				service: "devops-mcp",
				version: SERVER_VERSION,
				protocol: cfg.telemetry.protocol,
				env: cfg.telemetry.env,
				otel: { reachable: tel.reachable, endpoint: cfg.telemetry.endpoint },
				logs: { sink: cfg.telemetry.logs.sink },
				redact: { count: (cfg.telemetry.redact.paths || []).length },
				contractVersion: TELEMETRY_CONTRACT.version,
			},
			"service started",
		);
	} catch {}
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

	const rateCheck = (name: string) => {
		const cfg = getConfig();
		const tier = cfg.capabilities[name] ?? "default";
		const rps = name.includes("secrets_read_ref")
			? Number(cfg.limits?.secrets_rps ?? 0.2)
			: Number(
					(tier === "read_only" && cfg.limits?.read_only_rps) ||
						(tier === "pkg_admin" && cfg.limits?.pkg_admin_rps) ||
						cfg.limits?.default_rps ||
						2,
				);
		const { ok, retryAfterMs } = rlAllow(name, rps);
		if (!ok) throw new McpError(429, "rate_limited", { retryAfterMs });
	};

	// Tools
	server.registerTool(
		"project_discover",
		{ description: "Discover projects in configured workspaces" },
		async (_args) => {
			rateCheck("tool:project_discover");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined);
			try { incTool('project_discover', attrs); } catch {}
			const { projectDiscover } = await import("./tools/project_discover.js");
			const out = await projectDiscover({});
			try { observeToolDuration('project_discover', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: "text", text: JSON.stringify(out) }] };
		},
	);

	server.registerTool(
		"project_obs_run",
		{ description: "Run project observers", inputSchema: { project_id: z.string(), observer: z.enum(['git','mise','build','sbom']).optional() } },
		async (args) => {
			rateCheck("tool:project_obs_run");
			const t0 = Date.now();
			const { ProjectObsRunInput, projectObsRun } = await import("./tools/project_obs.js");
			const parsed = ProjectObsRunInput.safeParse(args ?? {});
			if (!parsed.success) return { content: [{ type: 'text', text: 'invalid_args' }], isError: true } as any;
			const pid = parsed.data.project_id; const observer = parsed.data.observer;
			const attrs = getProfileAttributes(undefined, pid);
			if (observer) { (attrs as any).observer = observer; }
			try {
				const { projectDiscover } = await import("./tools/project_discover.js");
				const all = await projectDiscover({});
				const proj = all.projects.find((p:any)=> p.id===pid);
				if (proj?.detectors?.length) { (attrs as any).detectors = (proj.detectors as string[]).join(','); }
			} catch {}
			try { incTool('project_obs_run', attrs); } catch {}
			const out = await projectObsRun(parsed.data);
			try { observeToolDuration('project_obs_run', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: 'text', text: JSON.stringify(out) }] } as any;
		},
	);

	server.registerTool(
		"project_health",
		{ description: "Summarize project observer health" },
		async (_args) => {
			rateCheck("tool:project_health");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined);
			try { incTool('project_health', attrs); } catch {}
			const { projectHealth } = await import("./tools/project_obs.js");
			const out = await projectHealth();
			try { observeToolDuration('project_health', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: 'text', text: JSON.stringify(out) }] } as any;
		},
	);

	server.registerTool(
		"server_maintain",
		{ description: "Run maintenance: audit checkpoint, retention, repo cache prune" },
		async () => {
			rateCheck("tool:server_maintain");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined);
			try { incTool('server_maintain', attrs); } catch {}
			const { serverMaintain } = await import('./tools/server_maintain.js');
			const out = await serverMaintain();
			try { observeToolDuration('server_maintain', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: 'text', text: JSON.stringify(out) }] } as any;
		}
	);

	server.registerResource(
		"project_manifest",
		"devops://project_manifest",
		{ title: "Project Manifest", mimeType: "application/json" },
		async (uri) => {
			rateCheck("resource:devops://project_manifest");
			const { getProjectManifest } = await import("./resources/project_manifest.js");
			let pid: string | undefined;
			try { const sp = (uri as unknown as URL)?.searchParams; pid = sp?.get("id") || sp?.get("project_id") || undefined; } catch {}
			const body = JSON.stringify(await getProjectManifest(pid), null, 2);
			return { contents: [{ uri: "devops://project_manifest", mimeType: "application/json", text: body }] } as any;
		},
	);

	server.registerTool(
		"integration_check",
		{ description: "Probe external bridge + internal services", inputSchema: { external: z.boolean().optional() } },
		async (args) => {
			rateCheck("tool:integration_check");
			const { integrationCheck } = await import('./tools/integration_check.js');
			const ext = Boolean((args as any)?.external ?? true);
			const out = await integrationCheck({ external: ext });
			return { content: [{ type: 'text', text: JSON.stringify(out) }] } as any;
		}
	);

	server.registerTool(
		"obs_migrate",
		{ description: "Merge per-observer NDJSON into observations.ndjson per project" },
		async () => {
			rateCheck("tool:obs_migrate");
			const { obsMigrate } = await import('./tools/obs_migrate.js');
			const out = await obsMigrate();
			return { content: [{ type: 'text', text: JSON.stringify(out) }] } as any;
		}
	);

	server.registerTool(
		"obs_validate",
		{ description: "Validate observation dirs and registry presence" },
		async () => {
			rateCheck("tool:obs_validate");
			const { obsValidate } = await import('./tools/obs_validate.js');
			const out = await obsValidate();
			return { content: [{ type: 'text', text: JSON.stringify(out) }] } as any;
		}
	);
	server.registerResource(
		"project_inventory",
		"devops://project_inventory",
		{ title: "Project Inventory", mimeType: "application/json" },
		async (_uri) => {
			rateCheck("resource:devops://project_inventory");
			const { getProjectInventory } = await import("./resources/project_inventory.js");
			const body = JSON.stringify(await getProjectInventory(), null, 2);
			return { contents: [{ uri: "devops://project_inventory", mimeType: "application/json", text: body }] } as any;
		},
	);
	server.registerResource(
		"project_status",
		"devops://project_status",
		{ title: "Project Status", mimeType: "application/json" },
		async (uri) => {
			rateCheck("resource:devops://project_status");
			const { getProjectStatus } = await import("./resources/project_status.js");
			let pid: string | undefined;
			try { const sp = (uri as unknown as URL)?.searchParams; pid = sp?.get("id") || sp?.get("project_id") || undefined; } catch {}
			const data = pid ? await getProjectStatus(pid) : { note: 'Provide ?project_id=...' };
			const body = JSON.stringify(data, null, 2);
			return { contents: [{ uri: "devops://project_status", mimeType: "application/json", text: body }] } as any;
		},
	);
	server.registerTool(
		"mcp_health",
		{ description: "Report server health and policy" },
		async () => {
			rateCheck("tool:mcp_health");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined);
			try { incTool('mcp_health', attrs); } catch {}
			const { mcpHealth } = await import("./tools/mcp_health.js");
			const payload = mcpHealth();
			const recorded = appendAudit({
				ts: new Date().toISOString(),
				tool: "mcp_health",
				args: {},
				result: { ok: true, summary: "ok" },
			});
			try { observeToolDuration('mcp_health', Date.now()-t0, attrs); } catch {}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ...payload, auditRecorded: recorded }),
					},
				],
			};
		},
	);
	server.registerTool(
		"patch_apply_check",
		{
			description: "Validate a unified diff against a repo without applying",
			inputSchema: {
				repo: z.string(),
				unifiedDiff: z.string(),
				reverse: z.boolean().optional(),
				checkOnly: z.boolean().optional(),
			},
		},
		async (args) => {
			rateCheck("tool:patch_apply_check");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('patch_apply_check', attrs); } catch {}
			const { PatchApplyInput, patchApplyCheck } = await import(
				"./tools/patch_apply.js"
			);
			const parsed = PatchApplyInput.parse(args ?? {});
			let out; try { out = await patchApplyCheck(parsed); }
			catch (e: any) { try { incToolError('patch_apply_check', e?.code || 'error', attrs); } catch {} throw e; }
			const recorded = appendAudit({
				ts: new Date().toISOString(),
				tool: "patch_apply_check",
				args: parsed,
				result: { ok: out.ok, code: out.code, summary: "patch_check" },
			});
			try { observeToolDuration('patch_apply_check', Date.now()-t0, attrs); } catch {}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ...out, auditRecorded: recorded }),
					},
				],
			};
		},
	);
	server.registerTool(
		"pkg_sync_plan",
		{
			description: "Compute package sync plan for Brewfile/mise",
			inputSchema: {
				brewfile: z.string().optional(),
				misefile: z.string().optional(),
			},
		},
		async (args) => {
			rateCheck("tool:pkg_sync_plan");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('pkg_sync_plan', attrs); } catch {}
			const { PkgSyncInput, pkgSyncPlan } = await import("./tools/pkg_sync.js");
			const parsed = PkgSyncInput.parse(args ?? {});
			let out; try { out = await pkgSyncPlan(parsed); } catch (e:any) { try { incToolError('pkg_sync_plan', e?.code || 'error', attrs); } catch {} throw e; }
			const recorded = appendAudit({
				ts: new Date().toISOString(),
				tool: "pkg_sync_plan",
				args: parsed,
				result: { ok: true, summary: out.summary },
			});
			try { observeToolDuration('pkg_sync_plan', Date.now()-t0, attrs); } catch {}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ...out, auditRecorded: recorded }),
					},
				],
			};
		},
	);
	const { PkgSyncApplyInput } = await import("./tools/pkg_sync.schemas.js");
	server.registerTool(
		"pkg_sync_apply",
		{
			description:
				"Apply a previously computed package sync plan (requires confirm=true)",
			inputSchema: PkgSyncApplyInput.shape,
		},
		async (args) => {
			const cfg = getConfig();
			const tier = cfg.capabilities.pkg_sync_apply ?? "pkg_admin";
			if (tier !== "pkg_admin") {
				return {
					content: [
						{ type: "text", text: "policy_violation: requires pkg_admin" },
					],
					isError: true,
				};
			}
			rateCheck("tool:pkg_sync_apply");
			const parsed = PkgSyncApplyInput.safeParse(args ?? {});
			if (!parsed.success)
				return {
					content: [
						{ type: "text", text: `invalid_args: ${parsed.error.message}` },
					],
					isError: true,
				};
			const { withFileLock } = await import("./lib/locks.js");
			const { withSpan } = await import("./lib/telemetry/tracing.js");
			const { incTool, incToolError, observeToolDuration } = await import(
				"./lib/telemetry/metrics.js"
			);
			const t0 = Date.now();
			const attrs = getProfileAttributes(undefined);
			incTool("pkg_sync_apply", attrs);
			try {
				const { pkgSyncApply } = await import("./tools/pkg_sync.js");
				const out = await withFileLock("pkg", async () =>
					pkgSyncApply({ plan: parsed.data.plan, confirm: true }),
				);
				const recorded = appendAudit({
					ts: new Date().toISOString(),
					tool: "pkg_sync_apply",
					args: {
						sizes: {
							brew: parsed.data.plan.brew.installs.length,
							mise: parsed.data.plan.mise.installs.length,
						},
					},
					result: { ok: out.ok, summary: "applied" },
				});
				observeToolDuration("pkg_sync_apply", Date.now() - t0, attrs);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ ...out, auditRecorded: recorded }),
						},
					],
				};
			} catch (e: any) {
				incToolError("pkg_sync_apply", e?.code || "error", attrs);
				observeToolDuration("pkg_sync_apply", Date.now() - t0, attrs);
				throw e;
			}
		},
	);
	server.registerTool(
		"dotfiles_apply",
		{
			description: "Apply chezmoi changes (requires confirm=true)",
			inputSchema: { profile: z.string().optional(), confirm: z.boolean() },
		},
		async (args) => {
			const cfg = getConfig();
			const tier = cfg.capabilities.dotfiles_apply ?? "mutate_repo";
			if (tier !== "mutate_repo" && tier !== "pkg_admin") {
				return {
					content: [
						{ type: "text", text: "policy_violation: requires mutate_repo" },
					],
					isError: true,
				};
			}
			rateCheck("tool:dotfiles_apply");
			const t0 = Date.now(); const attrs = getProfileAttributes((args as any)?.profile);
			try { incTool('dotfiles_apply', attrs); } catch {}
			if (!args?.confirm)
				return {
					content: [{ type: "text", text: "confirmation_required" }],
					isError: true,
				};
			const { DotfilesApplyInput, dotfilesApply } = await import(
				"./tools/dotfiles_apply.js"
			);
			const parsed = DotfilesApplyInput.parse(args ?? {});
			let out; try { out = await dotfilesApply(parsed); } catch (e:any) { try { incToolError('dotfiles_apply', e?.code || 'error', attrs); } catch {} throw e; }
			const recorded = appendAudit({
				ts: new Date().toISOString(),
				tool: "dotfiles_apply",
				args: { profile: parsed.profile },
				result: { ok: out.ok, summary: out.summary },
			});
			try { observeToolDuration('dotfiles_apply', Date.now()-t0, attrs); } catch {}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ...out, auditRecorded: recorded }),
					},
				],
			};
		},
	);
	server.registerTool(
		"secrets_read_ref",
		{
			description: "Return an opaque secretRef for a gopass path",
			inputSchema: { path: z.string() },
		},
		async (args) => {
			rateCheck("tool:secrets_read_ref");
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('secrets_read_ref', attrs); } catch {}
			const { SecretRefInput, makeSecretRef } = await import(
				"./tools/secrets.js"
			);
			const parsed = SecretRefInput.parse(args ?? {});
			let ref; try { ref = makeSecretRef(parsed.path); } catch (e:any) { try { incToolError('secrets_read_ref', e?.code || 'error', attrs); } catch {} throw e; }
			const recorded = appendAudit({
				ts: new Date().toISOString(),
				tool: "secrets_read_ref",
				args: { path: parsed.path },
				result: { ok: true, summary: "ref" },
			});
			try { observeToolDuration('secrets_read_ref', Date.now()-t0, attrs); } catch {}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ ref, auditRecorded: recorded }),
					},
				],
			};
		},
	);

	// Routine: converge host
	const { ConvergeInput, convergeHost } = await import(
		"./tools/converge_host.js"
	);
	server.registerTool(
		"converge_host",
		{
			description: "Plan and optionally converge host for a project",
			inputSchema: ConvergeInput.shape,
		},
		async (args) => {
			rateCheck("tool:converge_host");
			const parsed = ConvergeInput.safeParse(args ?? {});
			if (!parsed.success)
				return {
					content: [
						{ type: "text", text: `invalid_args: ${parsed.error.message}` },
					],
					isError: true,
				};
			const out = await convergeHost(parsed.data);
			return { content: [{ type: "text", text: JSON.stringify(out) }] };
		},
	);

	// Resources
	server.registerResource(
		"policy_manifest",
		"devops://policy_manifest",
		{ title: "Policy", mimeType: "application/json" },
    async (_uri) => {
      rateCheck("resource:devops://policy_manifest");
      const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('resource_policy_manifest', attrs); } catch {}
      const body = JSON.stringify(getPolicyManifest(), null, 2);
			appendAudit({
				ts: new Date().toISOString(),
				tool: "resource_read",
				args: { uri: "devops://policy_manifest" },
				result: { ok: true, summary: "policy_manifest" },
			});
      try { observeToolDuration('resource_policy_manifest', Date.now()-t0, attrs); } catch {}
      return {
				contents: [
					{
						uri: "devops://policy_manifest",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);
	server.registerResource(
		"dotfiles_state",
		"devops://dotfiles_state",
		{ title: "Dotfiles", mimeType: "application/json" },
    async (_uri) => {
      rateCheck("resource:devops://dotfiles_state");
      const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('resource_dotfiles_state', attrs); } catch {}
      const body = JSON.stringify(await getDotfilesState(), null, 2);
			appendAudit({
				ts: new Date().toISOString(),
				tool: "resource_read",
				args: { uri: "devops://dotfiles_state" },
				result: { ok: true, summary: "dotfiles_state" },
			});
      try { observeToolDuration('resource_dotfiles_state', Date.now()-t0, attrs); } catch {}
      return {
				contents: [
					{
						uri: "devops://dotfiles_state",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);
	server.registerResource(
		"pkg_inventory",
		"devops://pkg_inventory",
		{ title: "Packages", mimeType: "application/json" },
    async (_uri) => {
      rateCheck("resource:devops://pkg_inventory");
      const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('resource_pkg_inventory', attrs); } catch {}
      const body = JSON.stringify(await getPkgInventory(), null, 2);
			appendAudit({
				ts: new Date().toISOString(),
				tool: "resource_read",
				args: { uri: "devops://pkg_inventory" },
				result: { ok: true, summary: "pkg_inventory" },
			});
      try { observeToolDuration('resource_pkg_inventory', Date.now()-t0, attrs); } catch {}
      return {
				contents: [
					{
						uri: "devops://pkg_inventory",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);
	server.registerResource(
		"repo_status",
		"devops://repo_status",
		{ title: "Repos", mimeType: "application/json" },
    async (_uri) => {
      rateCheck("resource:devops://repo_status");
      const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('resource_repo_status', attrs); } catch {}
      const body = JSON.stringify(await getRepoStatus(), null, 2);
			appendAudit({
				ts: new Date().toISOString(),
				tool: "resource_read",
				args: { uri: "devops://repo_status" },
				result: { ok: true, summary: "repo_status" },
			});
      try { observeToolDuration('resource_repo_status', Date.now()-t0, attrs); } catch {}
      return {
				contents: [
					{
						uri: "devops://repo_status",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);

	// Telemetry info (for dashboards and setup tools)
	server.registerResource(
		"telemetry_info",
		"devops://telemetry_info",
		{ title: "Telemetry Info", mimeType: "application/json" },
		async (_uri) => {
			rateCheck("resource:devops://telemetry_info");
			const { getTelemetryInfo } = await import("./lib/telemetry/info.js");
			const body = JSON.stringify(getTelemetryInfo(), null, 2);
			appendAudit({
				ts: new Date().toISOString(),
				tool: "resource_read",
				args: { uri: "devops://telemetry_info" },
				result: { ok: true, summary: "telemetry_info" },
			});
			return {
				contents: [
					{
						uri: "devops://telemetry_info",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);

	// Self diagnostics
	server.registerResource(
		"self_status",
		"devops://self_status",
		{ title: "Self Status", mimeType: "application/json" },
		async (_uri) => {
			const { getSelfStatus } = await import("./resources/self_status.js");
			const body = JSON.stringify(getSelfStatus(), null, 2);
			return { contents: [{ uri: "devops://self_status", mimeType: "application/json", text: body }] } as any;
		},
	);
	server.registerTool(
		"self_snapshot",
		{ description: "Snapshot self status and append to history" },
		async () => {
			const { recordSelfStatusNow } = await import('./resources/self_status.js');
			const snap = recordSelfStatusNow();
			return { content: [{ type: 'text', text: JSON.stringify(snap, null, 2) }] } as any;
		}
	);
	server.registerResource(
		"self_status_history",
		"devops://self_status_history",
		{ title: "Self Status History", mimeType: "application/json" },
		async (_uri) => {
			const { getSelfStatusHistory, summarizeSelfHistory } = await import("./resources/self_status.js");
			const points = getSelfStatusHistory(60);
			const summary = summarizeSelfHistory(points);
			const body = JSON.stringify({ points, summary }, null, 2);
			return { contents: [{ uri: "devops://self_status_history", mimeType: "application/json", text: body }] } as any;
		},
	);

	// System repo / desired state resources
	const { getSystemRepoState } = await import(
		"./resources/system_repo_state.js"
	);
	const { getSystemDesiredState, DesiredStateInput } = await import(
		"./resources/system_desired_state.js"
	);
	const { getPolicyManifestRepo } = await import(
		"./resources/policy_manifest_repo.js"
	);
	server.registerResource(
		"system_repo_state",
		"devops://system_repo_state",
		{ title: "System Repo", mimeType: "application/json" },
		async (_uri) => {
			const body = JSON.stringify(await getSystemRepoState(), null, 2);
			return {
				contents: [
					{
						uri: "devops://system_repo_state",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);
	server.registerResource(
		"policy_manifest_repo",
		"devops://policy_manifest_repo",
		{ title: "Repo Policy", mimeType: "application/json" },
		async (_uri) => {
			const body = JSON.stringify(await getPolicyManifestRepo(), null, 2);
			return {
				contents: [
					{
						uri: "devops://policy_manifest_repo",
						mimeType: "application/json",
						text: body,
					},
				],
			};
		},
	);
	server.registerTool(
		"system_repo_sync",
		{
			description: "Sync system repo to ref",
			inputSchema: {
				ref: z.string().optional(),
				verifySig: z.boolean().optional(),
			},
		},
		async (args) => {
			const { RepoSyncInput, systemRepoSync } = await import(
				"./tools/system_repo_sync.js"
			);
			const t0 = Date.now(); const attrs = getProfileAttributes(undefined); try { incTool('system_repo_sync', attrs); } catch {}
			const parsed = RepoSyncInput.safeParse(args ?? {});
			if (!parsed.success)
				return {
					content: [
						{ type: "text", text: `invalid_args: ${parsed.error.message}` },
					],
					isError: true,
				};
			let out; try { out = await systemRepoSync(parsed.data); } catch (e:any) { try { incToolError('system_repo_sync', e?.code || 'error', attrs); } catch {} throw e; }
			try { observeToolDuration('system_repo_sync', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: "text", text: JSON.stringify(out) }] };
		},
	);
	server.registerTool(
		"system_plan",
		{
			description: "Plan system from repo",
			inputSchema: {
				profile: z.string().optional(),
				host: z.string().optional(),
				ref: z.string().optional(),
			},
		},
		async (args) => {
			const { SystemPlanInput, systemPlan } = await import(
				"./tools/system_plan.js"
			);
			const t0 = Date.now(); const attrs = getProfileAttributes((args as any)?.profile);
			try { incTool('system_plan', attrs); } catch {}
			const parsed = SystemPlanInput.safeParse(args ?? {});
			if (!parsed.success)
				return {
					content: [
						{ type: "text", text: `invalid_args: ${parsed.error.message}` },
					],
					isError: true,
				};
			let out; try { out = await systemPlan(parsed.data); } catch (e:any) { try { incToolError('system_plan', e?.code || 'error', attrs); } catch {} throw e; }
			try { observeToolDuration('system_plan', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: "text", text: JSON.stringify(out) }] };
		},
	);
	server.registerTool(
		"system_converge",
		{
			description: "Converge host from repo state",
			inputSchema: {
				profile: z.string().optional(),
				host: z.string().optional(),
				ref: z.string().optional(),
				confirm: z.boolean().optional(),
			},
		},
		async (args) => {
			const { SystemConvergeInput, systemConverge } = await import(
				"./tools/system_converge.js"
			);
			const t0 = Date.now(); const attrs = getProfileAttributes((args as any)?.profile);
			try { incTool('system_converge', attrs); } catch {}
			const parsed = SystemConvergeInput.safeParse(args ?? {});
			if (!parsed.success)
				return {
					content: [
						{ type: "text", text: `invalid_args: ${parsed.error.message}` },
					],
					isError: true,
				};
			let out; try { out = await systemConverge(parsed.data); } catch (e:any) { try { incToolError('system_converge', e?.code || 'error', attrs); } catch {} throw e; }
			try { observeToolDuration('system_converge', Date.now()-t0, attrs); } catch {}
			return { content: [{ type: "text", text: JSON.stringify(out) }] };
		},
	);

	// Init audit + signals
	try {
		initAudit(
			`${process.env.HOME}/Library/Application Support/devops.mcp/audit.sqlite3`,
		);
	} catch {}
	try {
		retain(getConfig().audit?.retainDays ?? 30);
	} catch {}
	setInterval(() => {
		try {
			retain(getConfig().audit?.retainDays ?? 30);
		} catch {}
	}, 6 * 3600_000);
  // Repo cache pruning daily
  setInterval(() => {
		try {
			const cfg = getConfig();
			const days = cfg.system_repo?.cache_days ?? 14;
			const { pruneRepoCache } = require("./lib/git.js");
			pruneRepoCache(days);
		} catch {}
  }, 24 * 3600_000);
  // Periodic audit checkpoint (ensures sqlite_wasm persistence)
  setInterval(() => { try { checkpointAudit(); } catch {} }, 60_000);
  // Daily vacuum/compaction
  setInterval(() => { try { vacuumAudit(); } catch {} }, 24 * 3600_000);
	for (const sig of ["SIGINT", "SIGTERM"] as const) {
		process.on(sig, () => {
			try {
				closeAudit();
			} finally {
				process.exit(0);
			}
		});
	}

	const transport = new StdioServerTransport();
  await server.connect(transport);
  try {
    process.stderr.write(`READY ${Date.now()}\n`);
  } catch {}
  // Optional dashboard bridge (read-only HTTP shim)
  try {
    const cfg = getConfig();
    if (cfg.dashboard_bridge?.enabled) {
      const { startDashboardBridge } = await import('./http/shim.js');
      startDashboardBridge();
    }
  } catch {}

  // Record self status periodically and at startup
  try {
    const { recordSelfStatus } = await import('./resources/self_status.js');
    recordSelfStatus();
    setInterval(() => { try { recordSelfStatus(); } catch {} }, 60_000);
  } catch {}

  // Run daily maintenance and once at startup (non-blocking)
  try {
    const { serverMaintain } = await import('./tools/server_maintain.js');
    setTimeout(() => { try { serverMaintain(); } catch {} }, 5000);
    setInterval(() => { try { serverMaintain(); } catch {} }, 24 * 3600_000);
  } catch {}
}

main().catch((err) => {
	console.error("[devops.mcp] fatal", err);
	process.exit(1);
});
