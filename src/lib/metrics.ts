const counts = new Map<string, number>();

export function incTool(name: string) {
	counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function snapshot() {
	const obj: Record<string, number> = {};
	for (const [k, v] of counts.entries()) obj[k] = v;
	return obj;
}
