const repo = "synthlet";
const isDeploy = process.env.DEPLOY || false;

let assetPrefix = "/";
let basePath = "";

if (isDeploy) {
  assetPrefix = `/${repo}/`;
  basePath = `/${repo}`;
}
/** @type {import('next').NextConfig} */
export default {
  output: "export",
  assetPrefix,
  basePath,
  reactStrictMode: true,
};
