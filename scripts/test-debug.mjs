import { spawn } from "node:child_process";

const cwd = process.cwd();
const child = spawn("node", ["dist/index.js"], {
	cwd,
	stdio: ["pipe", "pipe", "pipe"],
	detached: false,
});

let ready = false;
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => {
	console.error("STDERR:", d);
	if (!ready && /READY\s+\d+/.test(d)) ready = true;
});

const bufs = [];
child.stdout.on("data", (d) => {
	console.log("STDOUT chunk:", d.length, "bytes");
	bufs.push(Buffer.from(d));
});

function frame(msg) {
	const s = JSON.stringify(msg);
	return `Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`;
}
function send(msg) {
	const data = frame(msg);
	console.log("SENDING:", data.substring(0, 100) + "...");
	child.stdin.write(data);
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function main() {
	// wait readiness
	const start = Date.now();
	while (!ready && Date.now() - start < 5000) await sleep(50);
	console.log("Server ready:", ready);

	// initialize handshake
	send({
		jsonrpc: "2.0",
		id: 1,
		method: "initialize",
		params: {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "debug", version: "0" },
		},
	});
	await sleep(500);

	// Check what we got back
	const data = Buffer.concat(bufs).toString("utf8");
	console.log("RAW RESPONSE:", data);

	// Try to parse
	if (data.includes("Content-Length")) {
		const hdrEnd = data.indexOf("\r\n\r\n");
		if (hdrEnd > -1) {
			const headers = data.slice(0, hdrEnd);
			console.log("HEADERS:", headers);
			const body = data.slice(hdrEnd + 4);
			console.log("BODY:", body);
			try {
				const parsed = JSON.parse(body);
				console.log("PARSED:", JSON.stringify(parsed, null, 2));
			} catch (e) {
				console.log("Parse error:", e.message);
			}
		}
	}

	child.kill();
}

main().catch((err) => {
	console.error("ERROR:", err);
	child.kill();
	process.exit(1);
});
