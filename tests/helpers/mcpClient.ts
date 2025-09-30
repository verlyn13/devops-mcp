import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

type Send = (msg: any) => void;
type Request = (method: string, params?: any) => Promise<any>;
type Close = () => void;

export async function launchServer(): Promise<{
	send: Send;
	request: Request;
	close: Close;
}> {
	const cwd = "/Users/verlyn13/Development/personal/devops-mcp";
	let child: ChildProcessWithoutNullStreams;
	const dist = `${cwd}/dist/index.js`;
	try {
		child = spawn("node", [dist], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
		});
	} catch {
		const npx =
			"/Users/verlyn13/.local/share/mise/installs/node/24.9.0/bin/npx";
		child = spawn(npx, ["-y", "tsx", "src/index.ts"], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
		});
	}
	const bufs: Buffer[] = [];
	child.stdout.on("data", (d) => bufs.push(Buffer.from(d)));

	function frame(msg: any) {
		const s = JSON.stringify(msg);
		return `Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`;
	}
	function send(msg: any) {
		child.stdin.write(frame(msg));
	}

	let idCounter = 1;
	async function request(method: string, params?: any): Promise<any> {
		const id = idCounter++;
		const payload = { jsonrpc: "2.0", id, method, params };
		send(payload);
		const start = Date.now();
		while (Date.now() - start < 5000) {
			await new Promise((r) => setTimeout(r, 50));
			const msgs = readMessages(bufs);
			const hit = msgs.find((m) => m.id === id && (m.result || m.error));
			if (hit) return hit.result ?? Promise.reject(hit.error);
		}
		throw new Error(`timeout waiting for ${method}`);
	}
	function close() {
		try {
			child.kill();
		} catch {}
	}

	// initialize handshake
	send({
		jsonrpc: "2.0",
		id: 0,
		method: "initialize",
		params: {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "test", version: "0" },
		},
	});
	// give server time
	await new Promise((r) => setTimeout(r, 150));
	// notify initialized
	send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
	await new Promise((r) => setTimeout(r, 50));

	function readMessages(buf: Buffer[]): any[] {
		const data = Buffer.concat(buf).toString("utf8");
		const out: any[] = [];
		let i = 0;
		while (i < data.length) {
			const hdrEnd = data.indexOf("\r\n\r\n", i);
			if (hdrEnd === -1) break;
			const headers = data.slice(i, hdrEnd);
			const m = headers.match(/Content-Length: (\d+)/i);
			if (!m) break;
			const len = Number.parseInt(m[1], 10);
			const start = hdrEnd + 4;
			const end = start + len;
			const body = data.slice(start, end);
			try {
				out.push(JSON.parse(body));
			} catch {}
			i = end;
		}
		return out;
	}

	return { send, request, close };
}
