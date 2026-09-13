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

// The tutorial is a second collection rather than a folder inside the docs: it
// has its own order, its own page shape and its own reader. `dir` has to be set
// on both halves - `defineDocs` defaults `docs` and `meta` to `content/docs`
// independently, so setting it once would leave the chapter `meta.json` files
// being scanned out of the documentation.
export const { docs: learnDocs, meta: learnMeta } = defineDocs({
  docs: {
    dir: "content/learn",
    // Title and description are all a lesson needs to build and route. The rest
    // of the frontmatter - `core`, `book`, `hear`, `status` - arrives with the
    // content model.
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
    }),
  },
  meta: { dir: "content/learn" },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkInstall],
  },
});
