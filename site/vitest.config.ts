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
