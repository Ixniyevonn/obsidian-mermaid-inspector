import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { PluginOption, defineConfig } from "vite";

// ESM-compatible __dirname (vite config is loaded as ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const setOutDir = (mode: string) => {
  switch (mode) {
    case "development":
      return "./test-vault/.obsidian/plugins/obsidian-mermaid-inspector";
    case "production":
      return "build";
  }
};

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const isVitest = !!process.env.VITEST || mode === "test";
  const vaultPluginDir =
    "./test-vault/.obsidian/plugins/obsidian-mermaid-inspector";

  // When running under Vitest, return a minimal config.
  // This prevents the lib build config (rollupOptions, sourcemapBaseUrl, closeBundle copy hook)
  // from executing and causing pathToFileURL / executor errors during test discovery and run.
  // Our tests only exercise pure modules (parser, layout) that need no special vite setup.
  if (isVitest) {
    return {};
  }

  const plugins: PluginOption[] = [
    svelte({ preprocess: vitePreprocess() }) as PluginOption,
  ];

  // Only run the post-build copy in real production builds, never during tests or dev
  if (!isDev && !isVitest) {
    plugins.push({
      name: "copy-to-vault",
      closeBundle() {
        const buildDir = "build";
        fs.mkdirSync(vaultPluginDir, { recursive: true });

        // Copy the entry + styles + metadata...
        const alwaysCopy = [
          "main.js",
          "styles.css",
          "manifest.json",
          "versions.json",
        ];
        for (const file of alwaysCopy) {
          const src = path.join(buildDir, file);
          const dest = path.join(vaultPluginDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[copy-to-vault] Copied ${file} to ${vaultPluginDir}`);
          }
        }

        // ...plus any other emitted JS/CJS chunks (in case inlineDynamicImports ever gets disabled
        // or Mermaid internals force additional files). This prevents "Cannot find module './xxx.cjs'"
        // at plugin load time.
        try {
          const emitted = fs.readdirSync(buildDir);
          for (const file of emitted) {
            if (file === "main.js" || file === "styles.css") continue;
            if (!/\.(js|cjs)$/.test(file)) continue;
            if (file.endsWith(".map")) continue;

            const src = path.join(buildDir, file);
            const dest = path.join(vaultPluginDir, file);
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dest);
              console.log(
                `[copy-to-vault] Copied ${file} to ${vaultPluginDir}`,
              );
            }
          }
        } catch (e) {
          console.warn("[copy-to-vault] Could not scan for extra chunks:", e);
        }
      },
    });
  }

  // Only provide sourcemapBaseUrl when it makes sense (prevents File URL errors under vitest/vite-node)
  const useSourcemapBase =
    (mode === "development" || mode === "production") && !isVitest;

  // Always compute an absolute path for the base (path.join ensures correct separators on Windows)
  const sourcemapBaseDir = path.join(
    __dirname,
    "test-vault",
    ".obsidian",
    "plugins",
    "obsidian-mermaid-inspector",
  );

  return {
    plugins,
    build: {
      lib: {
        entry: "src/main",
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "main.js",
          assetFileNames: "styles.css",
          // Force a single bundle. Mermaid + its sub-diagrams (katex, cytoscape, rough, etc.)
          // cause Rollup to emit many chunks by default. Obsidian plugins expect the
          // entry (main.js) + any siblings to be self-contained in the plugin folder.
          // codeSplitting prevents separate chunk files.
          codeSplitting: false,
          ...(useSourcemapBase
            ? {
                sourcemapBaseUrl: pathToFileURL(sourcemapBaseDir).toString(),
              }
            : {}),
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
  };
});
