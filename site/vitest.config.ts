import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The highlighter, reached the long way round.
 *
 * Vite bundles this config with esbuild before it runs it, and shiki is
 * ESM-only, so a plain `import` of the module below becomes a `require` of an
 * ESM package and the config fails to load. A URL in a variable is a dynamic
 * import esbuild cannot analyse, so it survives the bundling and node resolves
 * it as the ES module it is. The webpack loader reaches the same file the same
 * way, for the same reason.
 */
const HIGHLIGHTER = new URL("./scripts/highlight-patch.mjs", import.meta.url)
  .href;

/**
 * `?raw`, the way `next.config.mjs` serves it.
 *
 * Vite has understood `?raw` since its first release, which is why vitest saw
 * the patches' source for free - but since 03b the query means a little more
 * than the file's text: it is the text *and* the same lines highlighted at
 * build time, which is how "View the code" reads like a documentation code
 * fence without a highlighter reaching the browser. A test that renders the
 * panel has to see what the browser will, so this plugin runs the same
 * `highlightLines` the webpack loader does over the same files.
 *
 * `enforce: "pre"` and a `load` hook, so it answers before Vite's own `?raw`
 * and before esbuild sees a `.ts`.
 */
const patchSource: Plugin = {
  name: "learn-patch-source",
  enforce: "pre",
  async load(id: string) {
    const [file, query] = id.split("?");
    if (query !== "raw" || !file.includes("/learn/patches/")) return undefined;

    const { highlightLines } = await import(HIGHLIGHTER);
    const source = await readFile(file, "utf8");
    const lines = await highlightLines(source);
    return (
      `export default ${JSON.stringify(source)};\n` +
      `export const lines = ${JSON.stringify(lines)};\n`
    );
  },
};

/*
 * The site's tests: the tutorial's rules, and whatever else lives beside the
 * code it checks.
 *
 * Explicit `include` rather than the default glob, because the default walks
 * the whole directory and `out/`, `.next/` and `.source/` are all generated,
 * all large, and all in it. Everything worth testing on this side of the repo
 * is under `learn/`.
 *
 * The packages keep their own jest suite at the repository root; it excludes
 * `/site/`, so the two runners never see each other's files.
 */
export default defineConfig({
  plugins: [patchSource],
  // Next compiles JSX with the automatic runtime and the site's files are
  // written for it - no `import React` anywhere. Without this, a `.tsx` test
  // transpiles to `React.createElement` and fails on a name nothing declares.
  esbuild: { jsx: "automatic" },
  resolve: {
    // The same `@/*` Next and `tsconfig.json` give the site. The kit reaches the
    // shared audio components through it, so a test that renders the kit has to
    // resolve it the same way the browser will.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["learn/**/*.test.ts", "learn/**/*.test.tsx"],
    environment: "node",
    // Forks, not worker threads. `learn/voice/learn-voice.test.ts` loads
    // `node-web-audio-api`, a native addon that runs real worklets on its own
    // render thread; native addons and worker threads are a bad combination and
    // a process is cheap at this suite's size.
    pool: "forks",
  },
});
