// source.config.ts
import { remarkInstall } from "fumadocs-docgen";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
var { docs, meta } = defineDocs();
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkInstall]
  }
});
export {
  source_config_default as default,
  docs,
  meta
};
