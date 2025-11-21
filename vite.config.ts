import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const buildTarget = (process.env.BUILD_TARGET ?? "inline") as "inline" | "cdn";
const isCdn = buildTarget === "cdn";

function htmlRenamePlugin(filename: string): Plugin {
  return {
    name: "solo-quiz-html-rename",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const [key, value] of Object.entries(bundle)) {
        if (value.type === "asset" && key.endsWith(".html")) {
          value.fileName = filename;
        }
      }
    },
  };
}

function katexShim(): Plugin {
  return {
    name: "solo-quiz-katex-shim",
    resolveId(id) {
      if (isCdn && id === "katex") {
        return id;
      }
    },
    load(id) {
      if (isCdn && id === "katex") {
        return "export default window.katex;";
      }
    },
  };
}

const inputHtml =
  buildTarget === "cdn" ? "index.cdn.html" : "index.standalone.html";
const outputName = buildTarget === "cdn" ? "cdn.html" : "standalone.html";

export default defineConfig({
  base: isCdn ? "./" : "/",
  plugins: [
    svelte(),
    !isCdn && viteSingleFile(),
    katexShim(),
    htmlRenamePlugin(outputName),
  ].filter(Boolean) as Plugin[],
  define: {
    __BUILD_TARGET__: JSON.stringify(buildTarget),
  },
  build: {
    outDir: "dist",
    emptyOutDir: !isCdn,
    target: "esnext",
    modulePreload: false,
    rollupOptions: {
      input: path.resolve(process.cwd(), inputHtml),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
