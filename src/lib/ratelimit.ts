type Bucket = {
	capacity: number; // tokens per second
	tokens: number;
	last: number; // ms
};

const buckets = new Map<string, Bucket>();

function now() {
	return Date.now();
}

export function setRate(name: string, rps: number) {
	const b = buckets.get(name) ?? { capacity: rps, tokens: rps, last: now() };
	b.capacity = rps;
	buckets.set(name, b);
}

export function allow(
	name: string,
	rps: number,
): { ok: boolean; retryAfterMs?: number } {
	let b = buckets.get(name);
	const t = now();
	if (!b) {
		b = { capacity: rps, tokens: rps, last: t };
		buckets.set(name, b);
	}
	// refill
	const delta = Math.max(0, t - b.last) / 1000;
	b.tokens = Math.min(b.capacity, b.tokens + delta * b.capacity);
	b.last = t;
	if (b.tokens >= 1) {
		b.tokens -= 1;
		return { ok: true };
	}
	const needed = 1 - b.tokens;
	const retryAfter = Math.ceil((needed / b.capacity) * 1000);
	return { ok: false, retryAfterMs: retryAfter };
}
