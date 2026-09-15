import { learnDocs, learnMeta } from "@/.source";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

/**
 * The tutorial's own tree, separate from the documentation's.
 *
 * Chapters are plain folders, so `sound/what-is-in-a-sound.mdx` is served at
 * `/learn/sound/what-is-in-a-sound` and the chapter stays in the URL. A route
 * group - `(sound)` - would be dropped from the slug by `fumadocs-core`, which
 * is the thirty-link 404 the documentation still has and the tutorial must
 * never acquire: its chapters are the spine.
 *
 * `content/learn/index.mdx` is the one file whose slug is empty. It is the
 * section's front page and is rendered by `app/learn/page.tsx`, so the lesson
 * catch-all has to filter it out of `generateStaticParams`.
 */
export const {
  getPage: getLearnPage,
  getPages: getLearnPages,
  pageTree: learnTree,
} = loader({
  baseUrl: "/learn",
  source: createMDXSource(learnDocs, learnMeta),
});
