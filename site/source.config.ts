import { remarkInstall } from "fumadocs-docgen";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

export const { docs, meta } = defineDocs({
  docs: {
    schema: (ctx) =>
      z.object({
        title: z.string(),
        description: z.string().optional(),
        full: z.boolean().optional(),
        package: z.string().optional(),
      }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkInstall],
  },
});
