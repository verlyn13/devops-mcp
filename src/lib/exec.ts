import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getConfig } from "../config.js";
import { isWithin } from "./paths.js";

const pexecFile = promisify(execFile);

export type ExecResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export type ExecOptions = {
	cwd?: string;
	timeoutMs?: number;
	envAllow?: Record<string, string | undefined>;
	pathExtra?: string[];
	secretRefs?: Record<string, string | undefined>;
};

function getPathDirs(): string[] {
	const cfg = getConfig();
	return cfg.allow.pathDirs ?? [];
}

function validateArgs(args: string[]) {
	const MAX_ARG = 8192;
	for (const a of args) {
		if (a.length > MAX_ARG) throw new Error("arg_too_large");
		if (/\u0000|[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(a))
			throw new Error("arg_control_char");
	}
}

export async function safeExecFile(
	file: string,
	args: string[] = [],
	opts: ExecOptions = {},
): Promise<ExecResult> {
	const { cwd, timeoutMs, envAllow, pathExtra, secretRefs } = opts;
	const cfg = getConfig();
	validateArgs(args);

	// Build absolute allowlist for commands (first path match for each name)
	const allowedAbs = new Set<string>();
	for (const name of cfg.allow.commands) {
		for (const dir of getPathDirs()) {
			const full = path.join(dir, name);
			try {
				const st = await import("node:fs").then((m) => m.statSync(full));
				if (st.isFile()) {
					allowedAbs.add(full);
					break;
				}
			} catch {}
		}
	}
	// Resolve the requested file to an absolute candidate (if just a basename, search PATH dirs)
	let candidate = file;
	if (!path.isAbsolute(candidate)) {
		for (const dir of [...getPathDirs(), ...(pathExtra ?? [])]) {
			const full = path.join(dir, candidate);
			try {
				const st = await import("node:fs").then((m) => m.statSync(full));
				if (st.isFile()) {
					candidate = full;
					break;
				}
			} catch {}
		}
	}
	if (!allowedAbs.has(candidate)) {
		return {
			code: 126,
			stdout: "",
			stderr: `policy_violation: command ${path.basename(file)} not allowlisted`,
		};
	}

	const PATH = [...getPathDirs(), ...(pathExtra ?? [])].join(":");
	const env = {
		PATH,
		LANG: "C",
		LC_ALL: "C",
		...(envAllow ?? {}),
	} as NodeJS.ProcessEnv;
	// Resolve secretRef env vars on the fly (no logging)
	if (secretRefs) {
		const { resolveSecretRef } = await import("../tools/secrets.js");
		for (const [k, ref] of Object.entries(secretRefs)) {
			if (!ref) continue;
			const val = await resolveSecretRef(ref);
			if (val != null) env[k] = val;
		}
	}

	// Validate cwd within allow.paths
	let runCwd = cwd;
	if (!runCwd) {
		runCwd = cfg.workspaces[0] ?? process.cwd();
	}
	if (!isWithin(cfg.allow.paths, runCwd)) {
		return {
			code: 126,
			stdout: "",
			stderr: `policy_violation: cwd not within allow.paths`,
		};
	}

	try {
		// Map defaults by command if no timeout provided
		const base = path.basename(candidate);
		const tmap: Record<string, number> = {
			brew: 300_000,
			mise: 120_000,
			git: 60_000,
		};
		const effTimeout = timeoutMs ?? tmap[base] ?? 60_000;
		const { stdout, stderr } = await pexecFile(candidate, args, {
			cwd: runCwd,
			timeout: effTimeout,
			windowsHide: true,
			shell: false,
			env,
			maxBuffer: 10 * 1024 * 1024,
		});
		return {
			code: 0,
			stdout: stdout.toString(),
			stderr: stderr?.toString() ?? "",
		};
	} catch (err: any) {
		if (err.killed && err.signal) {
			return {
				code: 124,
				stdout: err.stdout?.toString?.() ?? "",
				stderr: "timeout",
			};
		}
		if (err.stdout || err.stderr) {
			return {
				code: typeof err.code === "number" ? err.code : 1,
				stdout: err.stdout?.toString?.() ?? "",
				stderr: err.stderr?.toString?.() ?? (err.message || "exec error"),
			};
		}
		return { code: 1, stdout: "", stderr: err?.message ?? "exec error" };
	}
}
