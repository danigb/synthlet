import { getLearnPage } from "@/app/learn-source";
import { lessonComponents } from "@/app/learn/lesson-components";
import { ChapterMap } from "@/learn/chrome/ChapterMap";
import { CoreProgress } from "@/learn/chrome/CoreProgress";
import { allChapters, coreLessonUrls } from "@/learn/chrome/tree";
import { MapFigure } from "@/learn/kit/MapFigure";
import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// `content/learn/index.mdx` is the one page in the collection whose slug is
// empty. Looking it up once, here, keeps both of the routes that render it
// (`/learn` and `/learn/index`) reading the same file.
const indexPage = getLearnPage([]);

export const learnIndexMetadata: Metadata = {
  title: indexPage?.data.title,
  description: indexPage?.data.description,
};

/**
 * The section's front page: the map.
 *
 * Rendered from `index.mdx` by a route of its own rather than copied into place
 * from the first lesson the way `deploy:fix` does it for `/docs`. The front page
 * of a tutorial is the map of the whole thing; it cannot be a copy of lesson
 * one.
 *
 * Two halves. The prose is content, and says what the section is and how to
 * read it. The chapters are *not* content: eleven headings and fifty-seven
 * lesson titles written out in an `.mdx` file would be wrong the first time a
 * lesson was renamed, so they come from the tree, and the seven chapters nobody
 * has written yet come from the plan in `learn/chrome/chapters.ts`.
 */
export function LearnIndexPage() {
  if (!indexPage) notFound();

  const MDX = indexPage.data.body;

  return (
    <>
      <DocsTitle>{indexPage.data.title}</DocsTitle>
      <DocsDescription>{indexPage.data.description}</DocsDescription>

      <MapFigure />

      <DocsBody>
        <MDX components={lessonComponents} />
      </DocsBody>

      <section className="mt-12">
        <h2 className="max-w-learn border-t border-learn-border pt-learn font-learn-text text-xl font-semibold text-learn-ink">
          The chapters
        </h2>
        <CoreProgress core={coreLessonUrls()} />
        <ChapterMap chapters={allChapters()} />
      </section>
    </>
  );
}
