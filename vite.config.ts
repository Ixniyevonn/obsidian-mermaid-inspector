import fs from "node:fs";
import path from "node:path";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import { defineConfig, type PluginOption } from "vite";

const PLUGIN_DIRECTORY =
	"./test-vault/.obsidian/plugins/obsidian-mermaid-inspector";
const DISTRIBUTION_FILES = [
	"main.js",
	"styles.css",
	"manifest.json",
	"versions.json",
] as const;

function copyProductionBuild(): PluginOption {
	return {
		name: "copy-production-build-to-test-vault",
		closeBundle() {
			fs.mkdirSync(PLUGIN_DIRECTORY, { recursive: true });
			for (const file of DISTRIBUTION_FILES) {
				const source = path.join("build", file);
				if (!fs.existsSync(source)) continue;
				fs.copyFileSync(source, path.join(PLUGIN_DIRECTORY, file));
				console.log(`[copy-to-vault] Copied ${file} to ${PLUGIN_DIRECTORY}`);
			}
		},
	};
}

export default defineConfig(({ mode }) => {
	const development = mode === "development";
	const plugins: PluginOption[] = [
		svelte({ preprocess: vitePreprocess() }) as PluginOption,
	];
	if (!development) plugins.push(copyProductionBuild());

	return {
		plugins,
		build: {
			lib: { entry: "src/main", formats: ["cjs"] },
			outDir: development ? PLUGIN_DIRECTORY : "build",
			emptyOutDir: true,
			sourcemap: development ? "inline" : false,
			rollupOptions: {
				output: {
					entryFileNames: "main.js",
					assetFileNames: "styles.css",
					codeSplitting: false,
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtins,
				],
			},
		},
	};
});
