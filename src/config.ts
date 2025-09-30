import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as toml from "toml";
import { z } from "zod";
import { defaultDataDir } from "./lib/paths.js";

export const zConfig = z.object({
	allow: z.object({
		paths: z.array(z.string()).min(1),
		commands: z.array(z.string()).min(1),
		pathDirs: z.array(z.string()).default([]),
	}),
	limits: z
		.object({
			default_rps: z.number().default(2),
			read_only_rps: z.number().default(5),
			pkg_admin_rps: z.number().default(0.2),
			secrets_rps: z.number().default(0.2),
		})
		.partial(),
	capabilities: z
		.record(z.enum(["read_only", "mutate_repo", "pkg_admin"]))
		.default({}),
	timeouts: z
		.object({
			default: z.string().default("60s"),
			brew: z.string().default("300s"),
			mise: z.string().default("120s"),
			git: z.string().default("60s"),
		})
		.partial(),
	workspaces: z.array(z.string()).default([]),
	audit: z
		.object({
			dir: z.string().default(defaultDataDir()),
			kind: z.enum(["sqlite", "jsonl", "sqlite_wasm"]).default("sqlite"),
			retainDays: z.number().default(30),
			maxBlobBytes: z.number().default(262144),
    fallbackJsonl: z.boolean().default(true),
    jsonlMaxMB: z.number().default(100),
		})
		.default({
			dir: defaultDataDir(),
			kind: "sqlite",
			retainDays: 30,
			maxBlobBytes: 262144,
    fallbackJsonl: true,
    jsonlMaxMB: 100,
		}),
	pkg: z
		.object({
			apply_mode: z.enum(["per-op", "bundle"]).default("per-op"),
			brew_bundle_file: z.string().optional(),
			brew_bundle_cleanup: z.boolean().default(false),
			mise_mode: z.enum(["per-op"]).default("per-op"),
		})
		.default({
			apply_mode: "per-op",
			brew_bundle_cleanup: false,
			mise_mode: "per-op",
		}),
	secrets: z
		.object({
			gopass_roots: z.array(z.string()).default([]),
			gopass_storeDir: z.string().optional(),
		})
		.default({ gopass_roots: [] }),
	telemetry: z
		.object({
			enabled: z.boolean().default(false),
			export: z.enum(["otlp", "none"]).default("none"),
			endpoint: z.string().default("http://127.0.0.1:4318"),
			protocol: z.enum(["grpc", "http"]).default("http"),
			tempo_endpoint: z.string().optional(),
			enable_business_metrics: z.boolean().default(false),
			sample_ratio: z.number().default(1.0),
			max_queue: z.number().default(2048),
			env: z.string().default("local"),
    logs: z
        .object({
            level: z.enum(["debug", "info", "warn", "error"]).default("info"),
            sink: z.enum(["stderr", "file"]).default("stderr"),
            attributes_allowlist: z.array(z.string()).default([]),
            max_file_mb: z.number().default(64),
        })
        .default({ level: "info", sink: "stderr", attributes_allowlist: [], max_file_mb: 64 }),
			redact: z
				.object({
					paths: z.array(z.string()).default([]),
					censor: z.string().default("[REDACTED]"),
				})
				.default({ paths: [], censor: "[REDACTED]" }),
			security: z
				.object({ hash_repo_urls: z.boolean().default(true) })
				.default({ hash_repo_urls: true }),
		})
		.default({
			enabled: false,
			export: "none",
			endpoint: "http://127.0.0.1:4318",
			protocol: "http",
			tempo_endpoint: undefined,
			enable_business_metrics: false,
			sample_ratio: 1.0,
			max_queue: 2048,
			env: "local",
			logs: { level: "info", sink: "stderr" },
			redact: { paths: [], censor: "[REDACTED]" },
			security: { hash_repo_urls: true },
		}),
	dashboard_bridge: z
		.object({
			enabled: z.boolean().default(false),
			port: z.number().default(0),
			token: z.string().optional(),
			allowed_origins: z.array(z.string()).default([]),
			allow_mutations: z.boolean().default(false),
		})
		.default({ enabled: false, port: 0, allowed_origins: [], allow_mutations: false }),

	observers: z
		.object({
			dir: z.string().optional(),
			out_dir: z.string().default(path.join(defaultDataDir(), 'observations')),
			timeout_ms: z.number().default(5000),
		})
		.default({ out_dir: path.join(defaultDataDir(), 'observations'), timeout_ms: 5000 }),
	system_repo: z
		.object({
			url: z.string(),
			branch: z.string().default("main"),
			root: z.string().default("hosts"),
			allow_https: z.boolean().default(false),
			ssh_allow_hosts: z
				.array(z.string())
				.default(["github.com", "gitlab.com", "bitbucket.org"]),
			cache_days: z.number().default(14),
		})
		.optional(),
	profiles: z.record(z.string()).default({}),
telemetry_profiles: z
		.record(
			z.object({ tier: z.string().default("dev"), alert_channel: z.string().default(""), webhook_url: z.string().optional() }),
		)
		.default({}),
alerting: z
		.object({ enabled: z.boolean().default(false), webhook_url: z.string().optional() })
		.default({ enabled: false }),
slos: z
		.object({
			maxResidualPctAfterApply: z.number().default(0),
			maxConvergeDurationMs: z.number().default(120000),
			maxDroppedPer5m: z.number().default(0),
			maxDroppedPer5mTrace: z.number().default(0),
			maxDroppedPer5mMetric: z.number().default(0),
			maxDroppedPer5mLog: z.number().default(0),
		})
		.default({
			maxResidualPctAfterApply: 0,
			maxConvergeDurationMs: 120000,
			maxDroppedPer5m: 0,
			maxDroppedPer5mTrace: 0,
			maxDroppedPer5mMetric: 0,
			maxDroppedPer5mLog: 0,
		}),
  diagnostics: z.object({ self_history_max: z.number().default(120) }).default({ self_history_max: 120 })
});

export type Config = z.infer<typeof zConfig>;

function expandHome(p: string): string {
	if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
	return p;
}

let cached: Config | null = null;
let cfgPathCached: string | null = null;
let watcher: fs.FSWatcher | null = null;
let reloadTimer: NodeJS.Timeout | null = null;
let lastMtimeMs = 0;

export function loadConfig(): Config {
    let cfgPath =
        process.env.DEVOPS_MCP_CONFIG ??
        path.join(os.homedir(), ".config", "devops-mcp", "config.toml");
    if (process.env.NODE_ENV === "test") {
        // In test mode, prefer an explicit DEVOPS_MCP_CONFIG if provided.
        // Otherwise, fall back to a repo-local .tmp/config.toml seeded from examples.
        if (!process.env.DEVOPS_MCP_CONFIG) {
            const tmpDir = path.join(process.cwd(), ".tmp");
            try {
                fs.mkdirSync(tmpDir, { recursive: true });
            } catch {}
            const testCfg = path.join(tmpDir, "config.toml");
            if (!fs.existsSync(testCfg)) {
                try {
                    const example = path.join(
                        process.cwd(),
                        "examples",
                        "config.example.toml",
                    );
                    fs.copyFileSync(example, testCfg);
                } catch {}
            }
            cfgPath = testCfg;
        }
    }
    const raw = fs.readFileSync(cfgPath, "utf8");
    try {
        lastMtimeMs = fs.statSync(cfgPath).mtimeMs;
    } catch {}
    let baseObj: any = {};
    if (process.env.NODE_ENV === "test") {
        // Seed with example defaults to satisfy required sections in tests
        try {
            const exPath = path.join(process.cwd(), "examples", "config.example.toml");
            const exRaw = fs.readFileSync(exPath, "utf8");
            baseObj = toml.parse(exRaw) || {};
        } catch {}
    }
    const userObj = toml.parse(raw);
    const merged = { ...baseObj, ...userObj, 
        // shallow-merge nested known objects to preserve defaults where missing
        telemetry: { ...(baseObj.telemetry||{}), ...(userObj.telemetry||{}) },
        audit: { ...(baseObj.audit||{}), ...(userObj.audit||{}) },
        dashboard_bridge: { ...(baseObj.dashboard_bridge||{}), ...(userObj.dashboard_bridge||{}) },
        observers: { ...(baseObj.observers||{}), ...(userObj.observers||{}) },
    };
    const parsed = zConfig.parse(merged);
	// normalize tildes
	parsed.allow.paths = parsed.allow.paths.map(expandHome);
	parsed.workspaces = parsed.workspaces.map(expandHome);
	parsed.audit.dir = expandHome(parsed.audit.dir || defaultDataDir());
	if (process.env.NODE_ENV === "test") {
		const testData =
			process.env.DEVOPS_MCP_TEST_DATADIR ||
			path.join(process.cwd(), ".tmp", "data");
		try {
			fs.mkdirSync(testData, { recursive: true });
		} catch {}
		parsed.audit.dir = testData;
	}
	return parsed;
}

export function getConfig(): Config {
	const cfgPath =
		cfgPathCached ??
		process.env.DEVOPS_MCP_CONFIG ??
		path.join(os.homedir(), ".config", "devops-mcp", "config.toml");
	// Opportunistic reload if file changed
	try {
		const st = fs.statSync(cfgPath);
		if (st.mtimeMs > lastMtimeMs) {
			cached = loadConfig();
		}
	} catch {}
	if (cached) return cached;
	cached = loadConfig();
	cfgPathCached = cfgPath;
	try {
		watcher = fs.watch(cfgPath, { persistent: false }, () => {
			if (reloadTimer) clearTimeout(reloadTimer);
			reloadTimer = setTimeout(() => {
				try {
					const next = loadConfig();
					cached = next;
				} catch (e) {
					process.stderr.write(
						`[config] reload failed, keeping previous: ${String((e as Error).message)}\n`,
					);
				}
			}, 200);
		});
	} catch (e) {
		process.stderr.write(
			`[config] watch setup failed: ${String((e as Error).message)}\n`,
		);
	}
	// In case fs.watch does not fire, opportunistically reload if mtime changed
	try {
		const st = fs.statSync(cfgPath);
		if (st.mtimeMs > lastMtimeMs) {
			const next = loadConfig();
			cached = next;
		}
	} catch {}
	return cached;
}
