import { readFileSync } from "node:fs";
import {
	type PluginManifest,
	validateReleaseMetadata,
} from "./releaseMetadata";

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

const errors = validateReleaseMetadata({
	packageVersion: readJson<{ version: string }>("package.json").version,
	rootManifest: readJson<PluginManifest>("manifest.json"),
	publicManifest: readJson<PluginManifest>("public/manifest.json"),
	rootVersions: readJson<Record<string, string>>("versions.json"),
	publicVersions: readJson<Record<string, string>>("public/versions.json"),
	tag:
		process.env.GITHUB_REF_TYPE === "tag"
			? process.env.GITHUB_REF_NAME
			: undefined,
});

if (errors.length > 0) {
	for (const error of errors) console.error(`Release metadata error: ${error}`);
	process.exit(1);
}
console.log("Release metadata is synchronized.");
