import nextMDX from "@next/mdx";
import rehypeHighlight from "rehype-highlight";

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

const withMDX = nextMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [rehypeHighlight],
  },
});

export default withMDX(nextConfig);
