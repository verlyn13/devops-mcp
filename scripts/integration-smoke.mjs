import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const child = spawn("node", ["dist/index.js"], {
	cwd,
	stdio: ["pipe", "pipe", "pipe"],
	detached: false,
});

let ready = false;
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => {
	if (!ready && /READY\s+\d+/.test(d)) ready = true;
});

const bufs = [];
child.stdout.on("data", (d) => bufs.push(Buffer.from(d)));

const logDir = path.join(
	os.homedir(),
	"Library",
	"Application Support",
	"devops.mcp",
);
fs.mkdirSync(logDir, { recursive: true });
const tapPath = path.join(logDir, "integration-smoke.tap.log");
function tap(direction, obj) {
	try {
		fs.appendFileSync(
			tapPath,
			`${direction} ${new Date().toISOString()} ${JSON.stringify(obj)}\n`,
		);
	} catch {}
}

function send(msg) {
	const s = JSON.stringify(msg);
	tap(">", msg);
	child.stdin.write(s + "\n");
}

function readMessages() {
	const data = Buffer.concat(bufs).toString("utf8");
	const lines = data.split("\n").filter(Boolean);
	const out = [];
	for (const line of lines) {
		try {
			const obj = JSON.parse(line);
			tap("<", obj);
			out.push(obj);
		} catch {}
	}
	return out;
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function request(method, params) {
	const id = Math.floor(Math.random() * 1e9);
	send({ jsonrpc: "2.0", id, method, params });
	const start = Date.now();
	while (Date.now() - start < 20000) {
		await sleep(100);
		const msgs = readMessages();
		const hit = msgs.find((m) => m.id === id && (m.result || m.error));
		if (hit) return hit.result ?? Promise.reject(hit.error);
	}
	throw new Error(`timeout waiting for ${method}`);
}

async function main() {
	// wait readiness
	const start = Date.now();
	while (!ready && Date.now() - start < 5000) await sleep(50);
	// initialize handshake with version negotiation
	let initId = Math.floor(Math.random() * 1e9);
	send({
		jsonrpc: "2.0",
		id: initId,
		method: "initialize",
		params: {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "smoke", version: "0" },
		},
	});
	let initOk = false;
	let negotiated = undefined;
	let initInfo = undefined;
	const tInit = Date.now();
	while (Date.now() - tInit < 2000) {
		await sleep(100);
		const msgs = readMessages();
		const hit = msgs.find(
			(m) => m.id === initId && m.result && m.result.protocolVersion,
		);
		if (hit) {
			initOk = true;
			negotiated = hit.result.protocolVersion;
			initInfo = hit.result;
			break;
		}
	}
	if (!initOk) {
		// fallback to 2024-11-05
		initId = Math.floor(Math.random() * 1e9);
		send({
			jsonrpc: "2.0",
			id: initId,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "smoke", version: "0" },
			},
		});
		const t2 = Date.now();
		while (Date.now() - t2 < 2000) {
			await sleep(100);
			const msgs = readMessages();
			const hit = msgs.find(
				(m) => m.id === initId && m.result && m.result.protocolVersion,
			);
			if (hit) {
				initOk = true;
				negotiated = hit.result.protocolVersion;
				initInfo = hit.result;
				break;
			}
		}
		if (!initOk) throw new Error("initialize failed");
	}
	send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
	await sleep(400);
	// smoke calls
	const tools = await request("tools/list", {});
	if (!Array.isArray(tools.tools)) throw new Error("tools/list failed");
	const res = await request("resources/list", {});
	if (!Array.isArray(res.resources)) throw new Error("resources/list failed");
	// read some resources under 2s
	const t0 = Date.now();
	await request("resources/read", { uri: "devops://policy_manifest" });
	if (Date.now() - t0 > 2000) throw new Error("policy_manifest too slow");
	const t1 = Date.now();
	await request("resources/read", { uri: "devops://pkg_inventory" });
	if (Date.now() - t1 > 2000) throw new Error("pkg_inventory too slow");
	const t2 = Date.now();
	await request("resources/read", { uri: "devops://repo_status" });
	if (Date.now() - t2 > 2000) throw new Error("repo_status too slow");

	// capability gate: pkg_sync_apply without confirm (expect validation error)
	const call = async (name, args) =>
		await request("tools/call", { name, arguments: args });
	let badOk = false;
	try {
		await call("pkg_sync_apply", {
			plan: {
				brew: { installs: [], upgrades: [], uninstalls: [] },
				mise: { installs: [], upgrades: [], uninstalls: [] },
			},
			confirm: false,
		});
	} catch (e) {
		if (e && e.code === -32602) badOk = true; // invalid args (confirm must be true)
	}
	if (!badOk)
		throw new Error("expected invalid args for pkg_sync_apply without confirm");

	// rate-limit secrets_read_ref (enforce cfg.limits.secrets_rps)
	let rateHit = false;
	let retries = 0;
	let totalWait = 0;
	for (let i = 0; i < 6 && totalWait < 4000; i++) {
		try {
			await call("secrets_read_ref", { path: "personal/devops/none" });
		} catch (e) {
			if (e && e.code === 429) {
				rateHit = true;
				const ms = Math.min(500, e.data?.retryAfterMs ?? 100);
				await sleep(ms);
				totalWait += ms;
				retries++;
			}
		}
	}
	if (!rateHit)
		console.error(
			"warn: no 429 observed for secrets_read_ref under current limits",
		);

	// Print integration summary
	const toolsList = await request("tools/list", {});
	const resourcesList = await request("resources/list", {});
	const health = await call("mcp_health", {});
	const parsedHealth = (() => {
		try {
			return JSON.parse(health.res.content[0].text);
		} catch {
			return {};
		}
	})();
	const auditKind = parsedHealth.audit?.kind ?? "unknown";
	const version =
		initInfo?.serverInfo?.version ?? parsedHealth.serverVersion ?? "unknown";
	console.error(
		`devops-mcp v${version} | protocol=${negotiated || "unknown"} | tools=${toolsList.tools.length} | resources=${resourcesList.resources.length} | audit=${auditKind}`,
	);
	child.kill();
}

main().catch(async (err) => {
	console.error(err);
	try {
		const os = await import("node:os");
		const fs = await import("node:fs");
		const path = await import("node:path");
		const logDir = path.join(
			os.homedir(),
			"Library",
			"Application Support",
			"devops.mcp",
		);
		fs.mkdirSync(logDir, { recursive: true });
		const out = Buffer.concat(bufs).toString("utf8");
		fs.writeFileSync(
			path.join(logDir, "integration-smoke.out.log"),
			out,
			"utf8",
		);
	} catch {}
	child.kill();
	process.exit(1);
});
