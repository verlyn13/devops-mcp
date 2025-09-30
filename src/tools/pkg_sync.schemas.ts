import { z } from "zod";

export const BrewPlanSchema = z.object({
	installs: z.array(z.string()).describe("brew formula names to install"),
	upgrades: z.array(z.string()).describe("brew formula names to upgrade"),
	uninstalls: z.array(z.string()).describe("brew formula names to uninstall"),
});

export const MisePlanSchema = z.object({
	installs: z
		.array(z.string())
		.describe("mise specs like name@version to install"),
	upgrades: z
		.array(z.string())
		.describe("mise specs like name@version to upgrade"),
	uninstalls: z.array(z.string()).describe("mise plugin names to uninstall"),
});

export const PkgSyncPlanSchema = z.object({
	brew: BrewPlanSchema,
	mise: MisePlanSchema,
});

export const PkgSyncApplyInput = z.object({
	plan: PkgSyncPlanSchema,
	confirm: z.literal(true).describe("must be true to apply"),
});
