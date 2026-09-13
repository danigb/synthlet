import { getLearnPage } from "@/app/learn-source";
import { lessonComponents } from "@/app/learn/lesson-components";
import { LessonList } from "@/learn/chrome/LessonList";
import { builtChapters, findChapter } from "@/learn/chrome/tree";
import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

/*
 * A chapter's front door.
 *
 * Two routes render it - `/learn/sound` and `/learn/sound/` - for the reason
 * `app/learn/index/page.tsx` gives about the section's own front page, so the
 * component and its three exports live here rather than in either of them.
 *
 * What it shows is the chapter's own intro when the chapter wrote one
 * (`<chapter>/index.mdx`, which `fumadocs-core` keeps off the lesson list), and
 * then the lessons in the order the chapter's `meta.json` puts them.
 */
export function ChapterPage({ params }: { params: { chapter: string } }) {
  const chapter = findChapter(params.chapter);
  if (!chapter) notFound();

  const intro = chapter.intro ? getLearnPage(chapter.intro.slugs) : undefined;
  const MDX = intro?.data.body;

  return (
    <>
      <p className="font-learn-text text-sm text-learn-ink-muted">
        Chapter {chapter.number}
      </p>

      <DocsTitle>{chapter.title}</DocsTitle>
      {chapter.intro?.description ? (
        <DocsDescription>{chapter.intro.description}</DocsDescription>
      ) : null}

      {MDX ? (
        <DocsBody>
          <MDX components={lessonComponents} />
        </DocsBody>
      ) : null}

      <LessonList lessons={chapter.lessons} detail />

      <p className="mt-12 border-t border-learn-border pt-learn font-learn-text text-sm">
        <Link
          className="text-learn-ink-muted underline decoration-learn-border underline-offset-4 hover:text-learn-accent"
          href="/learn"
        >
          ← Back to the map
        </Link>
      </p>
    </>
  );
}

/** One page per chapter that has a folder. The other seven are not routes yet. */
export function chapterParams() {
  return builtChapters().map((chapter) => ({ chapter: chapter.slug }));
}

export function chapterMetadata({
  params,
}: {
  params: { chapter: string };
}): Metadata {
  const chapter = findChapter(params.chapter);
  if (!chapter) notFound();

  return {
    title: chapter.intro?.title ?? chapter.title,
    description: chapter.intro?.description,
  };
}
