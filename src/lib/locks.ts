import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig } from "../config.js";

const inProcessLocks = new Map<string, Promise<void>>();

export async function withMutex<T>(
	name: string,
	fn: () => Promise<T>,
): Promise<T> {
	const prev = inProcessLocks.get(name) ?? Promise.resolve();
	let release!: () => void;
	const p = new Promise<void>((res) => (release = res));
	inProcessLocks.set(
		name,
		prev.then(() => p),
	);
	await prev; // wait chain
	try {
		return await fn();
	} finally {
		release();
		if (inProcessLocks.get(name) === p) inProcessLocks.delete(name);
	}
}

export async function withFileLock<T>(
	name: string,
	fn: () => Promise<T>,
	opts?: { wait?: boolean; ttlMs?: number },
): Promise<T> {
	const cfg = getConfig();
	const dir = path.join(
		cfg.audit?.dir ??
			path.join(os.homedir(), "Library", "Application Support", "devops.mcp"),
		"locks",
	);
	fs.mkdirSync(dir, { recursive: true });
	const lockPath = path.join(dir, `${name}.lock`);
	const wait = opts?.wait ?? true;
	const ttlMs = opts?.ttlMs ?? 10 * 60_000;

	const tryAcquire = (): number | null => {
		try {
			const fd = fs.openSync(lockPath, "wx");
			fs.writeFileSync(
				fd,
				JSON.stringify({ pid: process.pid, ts: Date.now() }),
			);
			return fd;
		} catch (e: any) {
			if (e && e.code === "EEXIST") return null;
			throw e;
		}
	};
	const isStale = (): boolean => {
		try {
			const raw = fs.readFileSync(lockPath, "utf8");
			const { pid, ts } = JSON.parse(raw);
			const age = Date.now() - (ts || 0);
			try {
				process.kill(pid, 0);
			} catch {
				return true;
			}
			return age > ttlMs;
		} catch {
			return true;
		}
	};

	let fd: number | null = tryAcquire();
	const start = Date.now();
	while (fd === null && wait) {
		if (isStale()) {
			try {
				fs.rmSync(lockPath);
			} catch {}
		}
		await new Promise((r) => setTimeout(r, 100));
		fd = tryAcquire();
		if (Date.now() - start > ttlMs) {
			break;
		}
	}
	if (fd === null) throw new Error("lock_busy");
	try {
		return await fn();
	} finally {
		try {
			if (fd !== null) fs.closeSync(fd);
		} catch {}
		try {
			fs.rmSync(lockPath);
		} catch {}
	}
}
