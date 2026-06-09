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
  const vaultPluginDir = "./test-vault/.obsidian/plugins/obsidian-mermaid-inspector";

  // When running under Vitest, return a minimal config.
  // This prevents the lib build config (rollupOptions, sourcemapBaseUrl, closeBundle copy hook)
  // from executing and causing pathToFileURL / executor errors during test discovery and run.
  // Our tests only exercise pure modules (parser, layout) that need no special vite setup.
  if (isVitest) {
    return {};
  }

  const plugins: PluginOption[] = [];

  // Only run the post-build copy in real production builds, never during tests or dev
  if (!isDev && !isVitest) {
    plugins.push({
      name: "copy-to-vault",
      closeBundle() {
        const buildDir = "build";
        fs.mkdirSync(vaultPluginDir, { recursive: true });
        const filesToCopy = ["main.js", "styles.css", "manifest.json", "versions.json"];
        for (const file of filesToCopy) {
          const src = path.join(buildDir, file);
          const dest = path.join(vaultPluginDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[copy-to-vault] Copied ${file} to ${vaultPluginDir}`);
          }
        }
      },
    });
  }

  // Only provide sourcemapBaseUrl when it makes sense (prevents File URL errors under vitest/vite-node)
  const useSourcemapBase = (mode === "development" || mode === "production") && !isVitest;

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
