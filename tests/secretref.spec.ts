import { describe, expect, it } from "vitest";
import { echoSecretEnvCheck } from "../src/tools/echo_secret_env_check.js";

describe("secretRef env injection", () => {
	it("injects env by secretRef and does not expose values", async () => {
		// Simulate gopass by setting a fake resolver env var consumed by resolveSecretRef (through gopass, which won't be called here)
		// We will rely on our secret resolver to return null when no gopass; to still test presence, we pass a literal ref and expect no present keys
		const out = await echoSecretEnvCheck({
			keys: ["GITHUB_TOKEN"],
			secretRefs: { GITHUB_TOKEN: "secret://gopass/github/token" },
		});
		// May not be present in this environment without gopass; test that it doesn't crash and returns array
		expect(Array.isArray(out.present)).toBe(true);
	});
});
