// source.config.ts
import { remarkInstall } from "fumadocs-docgen";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";
var { docs, meta } = defineDocs({
  docs: {
    schema: (ctx) => z.object({
      title: z.string(),
      description: z.string().optional(),
      full: z.boolean().optional(),
      package: z.string().optional()
    })
  }
});
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
