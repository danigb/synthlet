const withMDX = require("@next/mdx")();
const repo = "synthlet";
const isDeploy = process.env.DEPLOY || false;

let assetPrefix = "/";
let basePath = "";

if (isDeploy) {
  assetPrefix = `/${repo}/`;
  basePath = `/${repo}`;
}
/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["mdx", "tsx"],
  output: "export",
  assetPrefix,
  basePath,
  reactStrictMode: true,
};

module.exports = withMDX(nextConfig);
