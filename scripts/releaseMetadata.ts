export interface PluginManifest {
	id: string;
	version: string;
	minAppVersion: string;
}

export interface ReleaseMetadata {
	packageVersion: string;
	rootManifest: PluginManifest;
	publicManifest: PluginManifest;
	rootVersions: Record<string, string>;
	publicVersions: Record<string, string>;
	tag?: string;
}

export function validateReleaseMetadata(metadata: ReleaseMetadata): string[] {
	const errors: string[] = [];
	const { rootManifest, publicManifest } = metadata;
	if (!/^\d+\.\d+\.\d+$/.test(rootManifest.version)) {
		errors.push(
			`Manifest version must be stable SemVer (x.y.z): ${rootManifest.version}`,
		);
	}
	if (metadata.packageVersion !== rootManifest.version) {
		errors.push(
			`package.json version ${metadata.packageVersion} does not match manifest ${rootManifest.version}`,
		);
	}
	if (JSON.stringify(publicManifest) !== JSON.stringify(rootManifest)) {
		errors.push("public/manifest.json does not match manifest.json");
	}
	if (
		JSON.stringify(metadata.publicVersions) !==
		JSON.stringify(metadata.rootVersions)
	) {
		errors.push("public/versions.json does not match versions.json");
	}
	if (
		metadata.rootVersions[rootManifest.version] !== rootManifest.minAppVersion
	) {
		errors.push(
			`versions.json must map ${rootManifest.version} to ${rootManifest.minAppVersion}`,
		);
	}
	if (metadata.tag && metadata.tag !== rootManifest.version) {
		errors.push(
			`Git tag ${metadata.tag} does not match manifest version ${rootManifest.version}`,
		);
	}
	return errors;
}
export interface PreparedReleaseMetadata {
	packageVersion: string;
	manifest: PluginManifest;
	versions: Record<string, string>;
}

export function prepareReleaseMetadata(
	current: Pick<
		ReleaseMetadata,
		"packageVersion" | "rootManifest" | "rootVersions"
	>,
	version: string,
	minAppVersion = current.rootManifest.minAppVersion,
): PreparedReleaseMetadata {
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`Version must use stable SemVer (x.y.z): ${version}`);
	}
	if (!/^\d+\.\d+\.\d+$/.test(minAppVersion)) {
		throw new Error(
			`Minimum Obsidian version must use x.y.z: ${minAppVersion}`,
		);
	}
	return {
		packageVersion: version,
		manifest: { ...current.rootManifest, version, minAppVersion },
		versions: { ...current.rootVersions, [version]: minAppVersion },
	};
}
