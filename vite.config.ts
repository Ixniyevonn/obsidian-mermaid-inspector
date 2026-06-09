import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import { pathToFileURL } from "url";
import { PluginOption, defineConfig } from "vite";

const setOutDir = (mode: string) => {
    switch (mode) {
        case "development":
            return "./test-vault/.obsidian/plugins/obsidian-mermaid-inspector";
        case "production":
            return "build";
    }
};

export default defineConfig(({ mode }) => {
    return {
        plugins: [
            svelte({ preprocess: vitePreprocess() }) as PluginOption,
        ],
        build: {
            lib: {
                entry: "src/main",
                formats: ["cjs"],
            },
            rollupOptions: {
                output: {
                    entryFileNames: "main.js",
                    assetFileNames: "styles.css",
                    sourcemapBaseUrl: pathToFileURL(
                        `${__dirname}/test-vault/.obsidian/plugins/obsidian-mermaid-inspector/`,
                    ).toString(),
                    // Mermaid pulls in a lot (cytoscape, katex, roughjs, all diagram renderers...).
                    // We produce a single-file bundle for Obsidian (no extra chunks to load).
                    // Note: this makes the plugin binary large (~4MB gz). Acceptable for the feature.
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
            outDir: setOutDir(mode),
            emptyOutDir: false,
            sourcemap: "inline",
        },
        // Mermaid uses some dynamic features; keep define simple
        define: {
            "process.env": {},
        },
    };
});
