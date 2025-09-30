import { z } from "zod";

export const MiseTool = z.object({
	plugin: z.string().optional(),
	name: z.string().optional(),
	version: z.string().optional(),
	current: z.string().optional(),
	pinned: z.string().optional(),
	source: z.string().optional(),
});
export type MiseTool = z.infer<typeof MiseTool>;

export function asArray<T>(v: unknown): T[] {
	if (Array.isArray(v)) return v as T[];
	if (v && typeof v === "object")
		return Object.values(v as Record<string, unknown>) as T[];
	return [] as T[];
}

export function normalizeMiseList(
	v: unknown,
): { name: string; version?: string; pinned?: string; source?: string }[] {
	const arr = asArray<any>(v);
	return arr
		.map((it) => {
			const parsed = MiseTool.safeParse(it);
			const obj = parsed.success ? parsed.data : ({} as MiseTool);
			const name = obj.plugin || obj.name || "";
			const version = obj.version || obj.current;
			return { name, version, pinned: obj.pinned, source: obj.source };
		})
		.filter((x) => x.name);
}
