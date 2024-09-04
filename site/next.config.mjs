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
};

export default withMDX(config);
