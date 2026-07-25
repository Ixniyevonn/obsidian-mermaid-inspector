import { describe, expect, it } from "bun:test";
import {
	prepareReleaseMetadata,
	type ReleaseMetadata,
	validateReleaseMetadata,
} from "../scripts/releaseMetadata";

const valid: ReleaseMetadata = {
	packageVersion: "0.1.0",
	rootManifest: {
		id: "obsidian-mermaid-inspector",
		version: "0.1.0",
		minAppVersion: "0.15.0",
	},
	publicManifest: {
		id: "obsidian-mermaid-inspector",
		version: "0.1.0",
		minAppVersion: "0.15.0",
	},
	rootVersions: { "0.1.0": "0.15.0" },
	publicVersions: { "0.1.0": "0.15.0" },
	tag: "0.1.0",
};

describe("release metadata", () => {
	it("prepares synchronized version and compatibility values", () => {
		expect(prepareReleaseMetadata(valid, "0.2.0", "1.5.0")).toEqual({
			packageVersion: "0.2.0",
			manifest: {
				...valid.rootManifest,
				version: "0.2.0",
				minAppVersion: "1.5.0",
			},
			versions: { "0.1.0": "0.15.0", "0.2.0": "1.5.0" },
		});
	});

	it("rejects invalid release versions before writing files", () => {
		expect(() => prepareReleaseMetadata(valid, "v0.2")).toThrow();
	});
	it("accepts synchronized BRAT release metadata", () => {
		expect(validateReleaseMetadata(valid)).toEqual([]);
	});

	it("reports version, manifest, compatibility, and tag drift", () => {
		const errors = validateReleaseMetadata({
			...valid,
			packageVersion: "0.2.0",
			publicManifest: { ...valid.publicManifest, version: "0.2.0" },
			rootVersions: {},
			tag: "0.2.0",
		});
		expect(errors).toHaveLength(5);
	});
});
