import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import fs from "node:fs";
import path from "node:path";
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
  const isDev = mode === "development";
  const vaultPluginDir = "./test-vault/.obsidian/plugins/obsidian-mermaid-inspector";

  const plugins: PluginOption[] = [
    svelte({ preprocess: vitePreprocess() }) as PluginOption,
  ];

  if (!isDev) {
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
          sourcemapBaseUrl: pathToFileURL(
            `${__dirname}/test-vault/.obsidian/plugins/obsidian-mermaid-inspector/`,
          ).toString(),
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
