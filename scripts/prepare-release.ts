import { readFileSync, writeFileSync } from "node:fs";
import { type PluginManifest, prepareReleaseMetadata } from "./releaseMetadata";

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}
function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

const [version, minAppVersion] = process.argv
	.slice(2)
	.filter((arg) => arg !== "--");
if (!version) {
	console.error(
		"Usage: bun run release:prepare -- <version> [minimum-obsidian-version]",
	);
	process.exit(1);
}

const packageJson = readJson<Record<string, unknown> & { version: string }>(
	"package.json",
);
const manifest = readJson<PluginManifest>("manifest.json");
const versions = readJson<Record<string, string>>("versions.json");
const prepared = prepareReleaseMetadata(
	{
		packageVersion: packageJson.version,
		rootManifest: manifest,
		rootVersions: versions,
	},
	version,
	minAppVersion,
);

packageJson.version = prepared.packageVersion;
writeJson("package.json", packageJson);
writeJson("manifest.json", prepared.manifest);
writeJson("public/manifest.json", prepared.manifest);
writeJson("versions.json", prepared.versions);
writeJson("public/versions.json", prepared.versions);
console.log(
	`Prepared release ${prepared.packageVersion} for Obsidian ${prepared.manifest.minAppVersion}+.`,
);
console.log("Review the metadata changes, then run: bun run git:check");
