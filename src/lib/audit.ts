import crypto from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import initSqlJs, { Database as WasmDb, SqlJsStatic } from "sql.js";
import { loadConfig } from "../config.js";

export type AuditEntry = {
	ts: string; // ISO
	tool: string;
	args: unknown;
	result?: { ok: boolean; code?: number; summary?: string };
	stdout?: string;
	stderr?: string;
	errors?: { message: string }[];
	latencyMs?: number;
};

let db: Database.Database | null = null;
let wasmDb: WasmDb | null = null;
let wasmDbPath: string | null = null;
let lastCheckpointMs = 0;
let initDone = false;
let writeCount = 0;

function ensureDir(dir: string) {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sha256(s: string): string {
	return crypto.createHash("sha256").update(s).digest("hex");
}

export function initAudit(dbPath: string) {
    if (initDone) return;
    const cfg = loadConfig();
    if ((cfg.audit?.kind ?? "sqlite") === "sqlite_wasm") {
        // Initialize WASM DB, load from file if exists
        return (initSqlJs() as Promise<SqlJsStatic>).then((SQL) => {
            try {
                let bytes: Uint8Array | undefined;
                try { bytes = new Uint8Array(readFileSync(dbPath)); } catch {}
                wasmDb = new SQL.Database(bytes);
                wasmDbPath = dbPath;
                wasmDb!.run(`
    CREATE TABLE IF NOT EXISTS calls(
      id TEXT PRIMARY KEY,
      ts INTEGER,
      tool TEXT,
      args_hash TEXT,
      inputs_redacted INTEGER,
      exit_code INTEGER,
      stdout_sha TEXT,
      stderr_sha TEXT,
      latency_ms INTEGER,
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS blobs(
      sha TEXT PRIMARY KEY,
      bytes BLOB
    );
  `);
                initDone = true;
            } catch {}
        }).catch(() => { /* ignore, will fallback at append */ });
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.exec(`
    CREATE TABLE IF NOT EXISTS calls(
      id TEXT PRIMARY KEY,
      ts INTEGER,
      tool TEXT,
      args_hash TEXT,
      inputs_redacted INTEGER,
      exit_code INTEGER,
      stdout_sha TEXT,
      stderr_sha TEXT,
      latency_ms INTEGER,
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS blobs(
      sha TEXT PRIMARY KEY,
      bytes BLOB
    );
  `);
    initDone = true;
}

export function checkpointAudit() {
    if (db) {
        try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
        lastCheckpointMs = Date.now();
        return;
    }
    if (wasmDb && wasmDbPath) {
        try {
            const data = wasmDb.export();
            writeFileSync(wasmDbPath, Buffer.from(data));
        } catch {}
        lastCheckpointMs = Date.now();
    }
}

export function closeAudit() {
    if (db) {
        try { checkpointAudit(); } catch {}
        try { db.close(); } catch {}
        db = null;
        initDone = false;
        return;
    }
    if (wasmDb) {
        try { checkpointAudit(); } catch {}
        try { wasmDb.close(); } catch {}
        wasmDb = null;
        wasmDbPath = null;
        initDone = false;
    }
}

export function retain(days: number) {
    const cfg = loadConfig();
    const cutoff = Date.now() - days * 86400_000;
    if (db) {
        const r1 = db.prepare("DELETE FROM calls WHERE ts < ?").run(cutoff);
        const r2 = db
            .prepare(
                "DELETE FROM blobs WHERE sha NOT IN (SELECT stdout_sha FROM calls UNION SELECT stderr_sha FROM calls)",
            )
            .run();
        try { process.stderr.write(`[audit] retain: removed calls=${r1.changes || 0} blobs=${r2.changes || 0}\n`); } catch {}
        return;
    }
    if (wasmDb) {
        try {
            wasmDb.run("DELETE FROM calls WHERE ts < ?", [cutoff]);
            // blobs GC in wasm (no changes count available easily)
            wasmDb.run("DELETE FROM blobs WHERE sha NOT IN (SELECT stdout_sha FROM calls UNION SELECT stderr_sha FROM calls)");
        } catch {}
        try { process.stderr.write(`[audit] retain (wasm): completed\n`); } catch {}
    }
}

let warned = false;

export function appendAudit(entry: AuditEntry): boolean {
    const cfg = loadConfig();
	const dir =
		cfg.audit?.dir ??
		join(os.homedir(), "Library", "Application Support", "devops.mcp");
	ensureDir(dir);
	if ((cfg.audit?.kind ?? "sqlite") === "jsonl") {
		const file = join(dir, "audit.jsonl");
		const line =
			JSON.stringify({
				ts: entry.ts,
				tool: entry.tool,
				args: entry.args,
				result: entry.result,
				errors: entry.errors,
				latencyMs: entry.latencyMs,
			}) + "\n";
		const ws = createWriteStream(file, { flags: "a" });
		ws.write(line);
		ws.end();
		return true;
	}
    const dbPath = join(dir, "audit.sqlite3");
    try {
        initAudit(dbPath);
    } catch (e) {
        if (!warned) {
            process.stderr.write(
                `[audit] sqlite init failed, falling back to jsonl: ${String((e as Error).message)}\n`,
            );
            warned = true;
        }
        if (cfg.audit?.fallbackJsonl) {
			const file = join(dir, "audit.jsonl");
			const line =
				JSON.stringify({
					ts: entry.ts,
					tool: entry.tool,
					args: entry.args,
					result: entry.result,
					errors: entry.errors,
					latencyMs: entry.latencyMs,
				}) + "\n";
			const ws = createWriteStream(file, { flags: "a" });
			ws.write(line);
			ws.end();
			return false;
		}
		return false;
	}
    if (!db && !wasmDb) return false;

	const maxBytes = cfg.audit?.maxBlobBytes ?? 262144;
	const stdoutSha = entry.stdout ? sha256(entry.stdout) : null;
	const stderrSha = entry.stderr ? sha256(entry.stderr) : null;
	const argsHash = sha256(JSON.stringify(entry.args ?? {}));
	const id = crypto.randomUUID();

    if (db) {
        const sdb = db!;
        const tx = sdb.transaction(() => {
            if (stdoutSha && entry.stdout && entry.stdout.length <= maxBytes) {
                sdb
                    .prepare("INSERT OR IGNORE INTO blobs(sha, bytes) VALUES(?, ?)")
                    .run(stdoutSha, entry.stdout);
            }
            if (stderrSha && entry.stderr && entry.stderr.length <= maxBytes) {
                sdb
                    .prepare("INSERT OR IGNORE INTO blobs(sha, bytes) VALUES(?, ?)")
                    .run(stderrSha, entry.stderr);
            }
            sdb
                .prepare(
                    "INSERT INTO calls(id, ts, tool, args_hash, inputs_redacted, exit_code, stdout_sha, stderr_sha, latency_ms, summary) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .run(
                    id,
                    Date.parse(entry.ts),
                    entry.tool,
                    argsHash,
                    1,
                    entry.result?.code ?? null,
                    stdoutSha,
                    stderrSha,
                    entry.latencyMs ?? null,
                    entry.result?.summary ?? null,
                );
        });
        try { tx(); } catch (e) {
            if (!warned) {
                process.stderr.write(
                    `[audit] sqlite write failed, falling back to jsonl: ${String((e as Error).message)}\n`,
                );
                warned = true;
            }
            if (cfg.audit?.fallbackJsonl) {
                const file = join(dir, "audit.jsonl");
                const line =
                    JSON.stringify({
                        ts: entry.ts,
                        tool: entry.tool,
                        args: entry.args,
                        result: entry.result,
                        errors: entry.errors,
                        latencyMs: entry.latencyMs,
                    }) + "\n";
                const ws = createWriteStream(file, { flags: "a" });
                ws.write(line);
                ws.end();
            }
            return false;
        }
    } else if (wasmDb) {
        try {
            if (stdoutSha && entry.stdout && entry.stdout.length <= maxBytes) {
                wasmDb.run("INSERT OR IGNORE INTO blobs(sha, bytes) VALUES(?, ?)", [stdoutSha, entry.stdout]);
            }
            if (stderrSha && entry.stderr && entry.stderr.length <= maxBytes) {
                wasmDb.run("INSERT OR IGNORE INTO blobs(sha, bytes) VALUES(?, ?)", [stderrSha, entry.stderr]);
            }
            wasmDb.run(
                "INSERT INTO calls(id, ts, tool, args_hash, inputs_redacted, exit_code, stdout_sha, stderr_sha, latency_ms, summary) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    id,
                    Date.parse(entry.ts),
                    entry.tool,
                    argsHash,
                    1,
                    entry.result?.code ?? null,
                    stdoutSha,
                    stderrSha,
                    entry.latencyMs ?? null,
                    entry.result?.summary ?? null,
                ],
            );
        } catch (e) {
            if (!warned) {
                process.stderr.write(
                    `[audit] sqlite_wasm write failed, falling back to jsonl: ${String((e as Error).message)}\n`,
                );
                warned = true;
            }
            if (cfg.audit?.fallbackJsonl) {
                const file = join(dir, "audit.jsonl");
                const line =
                    JSON.stringify({
                        ts: entry.ts,
                        tool: entry.tool,
                        args: entry.args,
                        result: entry.result,
                        errors: entry.errors,
                        latencyMs: entry.latencyMs,
                    }) + "\n";
                const ws = createWriteStream(file, { flags: "a" });
                ws.write(line);
                ws.end();
            }
            return false;
        }
    }
    writeCount++;
    if (writeCount % 200 === 0) checkpointAudit();
    return true;
}

export function vacuumAudit() {
    if (db) {
        try { db.exec("VACUUM"); } catch {}
        return;
    }
    if (wasmDb) {
        try { wasmDb.run("VACUUM"); } catch {}
        try { if (wasmDbPath) { const data = wasmDb.export(); writeFileSync(wasmDbPath, Buffer.from(data)); } } catch {}
    }
}

export function getAuditInfo(): { backend: 'sqlite'|'sqlite_wasm'|'jsonl'|'none'; lastCheckpointMs: number } {
    let backend: 'sqlite'|'sqlite_wasm'|'jsonl'|'none' = 'none';
    if (db) backend = 'sqlite'; else if (wasmDb) backend = 'sqlite_wasm'; else backend = ((loadConfig().audit?.kind as any) ?? 'jsonl') as any;
    return { backend, lastCheckpointMs };
}

// Variant that returns the inserted id when sqlite is active; falls back to timestamp
export function appendAuditId(entry: AuditEntry): string {
	const cfg = loadConfig();
	const dir =
		cfg.audit?.dir ??
		join(
			process.env.HOME || os.homedir(),
			"Library",
			"Application Support",
			"devops.mcp",
		);
	ensureDir(dir);
	if ((cfg.audit?.kind ?? "sqlite") !== "sqlite") {
		appendAudit(entry);
		return `jsonl-${Date.now()}`;
	}
	const dbPath = join(dir, "audit.sqlite3");
	try {
		initAudit(dbPath);
	} catch {
		appendAudit(entry);
		return `jsonl-${Date.now()}`;
	}
	const maxBytes = cfg.audit?.maxBlobBytes ?? 262144;
	const stdoutSha = entry.stdout ? sha256(entry.stdout) : null;
	const stderrSha = entry.stderr ? sha256(entry.stderr) : null;
	const argsHash = sha256(JSON.stringify(entry.args ?? {}));
	const id = crypto.randomUUID();
	const tx = db!.transaction(() => {
		if (stdoutSha && entry.stdout && entry.stdout.length <= maxBytes) {
			db!
				.prepare("INSERT OR IGNORE INTO blobs(sha, bytes) VALUES(?, ?)")
				.run(stdoutSha, entry.stdout);
		}
		if (stderrSha && entry.stderr && entry.stderr.length <= maxBytes) {
			db!
				.prepare("INSERT OR IGNORE INTO blobs(sha, bytes) VALUES(?, ?)")
				.run(stderrSha, entry.stderr);
		}
		db!
			.prepare(
				"INSERT INTO calls(id, ts, tool, args_hash, inputs_redacted, exit_code, stdout_sha, stderr_sha, latency_ms, summary) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				id,
				Date.parse(entry.ts),
				entry.tool,
				argsHash,
				1,
				entry.result?.code ?? null,
				stdoutSha,
				stderrSha,
				entry.latencyMs ?? null,
				entry.result?.summary ?? null,
			);
	});
	tx();
	return id;
}
