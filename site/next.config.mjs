import { createMDX } from "fumadocs-mdx/next";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const withMDX = createMDX();

const HERE = dirname(fileURLToPath(import.meta.url));

const repo = "synthlet";
const isDeploy = process.env.DEPLOY || false;

/** The query that means "the file itself"; see `webpack` below. */
const RAW = /raw/;

/**
 * Would this condition match a TypeScript file?
 *
 * A webpack condition is a regexp, a string, a function, an array of any of
 * those, or an `{ and, or, not }` object - and Next's own is the last kind:
 * `{ or: [/\.(tsx|ts|js|cjs|mjs|jsx)$/, /__barrel_optimize__/] }`. Reading only
 * the regexp form is how the first version of this walk quietly guarded nothing
 * that mattered.
 *
 * `and` is treated like `or` on purpose. The answer decides whether a rule
 * stops seeing `?raw`, so a false yes costs nothing and a false no is the bug.
 */
function matchesTypeScript(condition) {
  if (!condition) return false;
  if (Array.isArray(condition)) return condition.some(matchesTypeScript);
  if (typeof condition === "string")
    return condition.endsWith(".ts") || condition.endsWith(".tsx");
  if (condition instanceof RegExp) {
    // A fresh RegExp: `lastIndex` on a `/g` rule would make this answer depend
    // on how often it has been asked.
    const pattern = new RegExp(
      condition.source,
      condition.flags.replace("g", ""),
    );
    return pattern.test("patch.ts") || pattern.test("patch.tsx");
  }
  if (typeof condition === "object")
    return (
      matchesTypeScript(condition.or) ||
      matchesTypeScript(condition.and) ||
      matchesTypeScript(condition.test)
    );
  // A function condition cannot be answered without calling it, and calling it
  // with an invented path is how a build breaks in a way nobody can read.
  return false;
}

/** The loaders a rule runs, by name, however the rule spells them. */
function loaderNames(rule) {
  const use = rule.use ?? rule.loader;
  const entries = Array.isArray(use) ? use : [use];
  return entries
    .map((entry) => (typeof entry === "string" ? entry : (entry?.loader ?? "")))
    .filter(Boolean);
}

/**
 * Add `resourceQuery: { not: [/raw/] }` to every rule that would compile a
 * `.ts`, and report how many of them run a compiler.
 *
 * Recursive, because Next nests the rules that matter inside `oneOf` arrays,
 * and merging rather than assigning, because a rule that already narrows itself
 * by query has to keep doing so.
 */
function excludeRaw(rules) {
  let compilers = 0;

  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    if (Array.isArray(rule.oneOf)) compilers += excludeRaw(rule.oneOf);
    if (Array.isArray(rule.rules)) compilers += excludeRaw(rule.rules);
    if (!matchesTypeScript(rule.test)) continue;

    const query = rule.resourceQuery;
    if (query === undefined) {
      rule.resourceQuery = { not: [RAW] };
    } else if (
      query &&
      typeof query === "object" &&
      !(query instanceof RegExp) &&
      Array.isArray(query.not)
    ) {
      query.not = [...query.not, RAW];
    } else {
      rule.resourceQuery = { and: [query], not: [RAW] };
    }
    if (loaderNames(rule).some((name) => name.includes("swc"))) compilers++;
  }

  return compilers;
}

let assetPrefix = "/";
let basePath = "";

if (isDeploy || true) {
  assetPrefix = `/${repo}/`;
  basePath = `/${repo}`;
}

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  assetPrefix,
  basePath,
  reactStrictMode: true,
  images: {
    unoptimized: true,
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.shields.io",
        port: "",
        pathname: "/**",
      },
    ],
  },
  /**
   * `import source from "./harmonics.ts?raw"`.
   *
   * The tutorial's "View the code" shows the patch file that is running, so the
   * code on the page cannot drift from the code that makes the sound. That
   * needs the file's own text at build time, which is what `asset/source` is:
   * webpack emits the module as a string instead of compiling it.
   *
   * Composed with `createMDX` below rather than replacing anything -
   * `fumadocs-mdx` adds loaders of its own and the two only meet in the same
   * `module.rules` array. `resourceQuery`, not `test`, so the *same* file can be
   * imported both ways: `./harmonics` is the patch, `./harmonics.ts?raw` is its
   * source.
   *
   * One rule is not enough, and that was a bug for three tickets. Webpack has
   * no "last rule wins": every rule whose conditions match a request applies to
   * it, and Next's rule for `/\.(tsx|ts|js|mjs|jsx)$/` carries no
   * `resourceQuery` guard - so `next-swc-loader` ran first and `asset/source`
   * faithfully stringified *its output*. Readers were shown compiled
   * JavaScript, a patch's `code: { lines }` sliced a text whose line numbers
   * were nobody's, and since the client bundle lowers `??` where the server
   * bundle leaves it, the two renders of `voice.ts` disagreed and React
   * reported a hydration mismatch on the lesson that shows it.
   *
   * So the rules that would have compiled the file are told to stand down for
   * this one query, and `scripts/patch-source-loader.cjs` is left alone with
   * it. That loader is where `asset/source` used to be: it returns the same
   * text as the default export and, since 03b, the same lines highlighted
   * (`scripts/highlight-patch.mjs`), so that the panel reads like a code fence
   * in the documentation without a highlighter reaching the browser.
   */
  webpack(config) {
    const compilers = excludeRaw(config.module.rules);
    // Counting the *compiling* rules, not the guarded ones: the walk found
    // rules on its first outing too, just not the ones that run SWC. And the
    // failure it is guarding against is silent - the site still builds, the
    // panels still fill, and only a reader notices that the types are gone -
    // so if Next ever changes the shape of its rules, fail here instead.
    if (compilers === 0) {
      throw new Error(
        "next.config.mjs: found no SWC rule to exclude `?raw` from. " +
          "Next's webpack rules have changed shape; see `excludeRaw` above " +
          'and site/learn/README.md, "View the code".',
      );
    }

    config.module.rules.push({
      resourceQuery: RAW,
      use: [{ loader: join(HERE, "scripts", "patch-source-loader.cjs") }],
      // The loader writes a module, not an asset. Said out loud because the
      // rule it replaced said `type: "asset/source"`, and the two are the
      // difference between `export default "…"` and a file webpack emits.
      type: "javascript/auto",
    });
    return config;
  },
};

export default withMDX(config);
