import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
