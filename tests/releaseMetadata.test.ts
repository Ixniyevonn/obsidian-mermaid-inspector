import { describe, expect, it } from "bun:test";
import {
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
