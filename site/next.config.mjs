import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const repo = "synthlet";
const isDeploy = process.env.DEPLOY || false;

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
   */
  webpack(config) {
    config.module.rules.push({
      resourceQuery: /raw/,
      type: "asset/source",
    });
    return config;
  },
};

export default withMDX(config);
