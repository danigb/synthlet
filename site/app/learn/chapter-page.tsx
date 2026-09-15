import { getLearnPage, getLearnPages } from "@/app/learn-source";
import { lessonComponents } from "@/app/learn/lesson-components";
import { LessonList } from "@/learn/chrome/LessonList";
import { builtChapters, findChapter } from "@/learn/chrome/tree";
import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import Link from "next/link";
import { LessonPage, lessonMetadata } from "./lesson-page";

/*
 * A chapter's front door - and everything else one segment under `/learn`.
 *
 * Two routes render it - `/learn/sound` and `/learn/sound/` - for the reason
 * `app/learn/index/page.tsx` gives about the section's own front page, so the
 * component and its three exports live here rather than in either of them.
 *
 * What it shows is the chapter's own intro when the chapter wrote one
 * (`<chapter>/index.mdx`, which `fumadocs-core` keeps off the lesson list), and
 * then the lessons in the order the chapter's `meta.json` puts them.
 *
 * `about` and `no-big-red-button` are one segment under `/learn` too, and a
 * single dynamic segment is narrower than a catch-all, so Next resolves them
 * *here* and never offers them to `[...slug]`. The export did not notice -
 * `generateStaticParams` decides what a static export writes, and the catch-all
 * wrote both files - but `next dev` routes a request rather than a manifest,
 * and answered 500: "missing param in generateStaticParams()". So this route
 * owns every single segment, and hands the ones that are not chapters to the
 * page that knows how to render a page. Found by `check:sound`, which is what
 * it is for.
 */
export function ChapterPage({ params }: { params: { chapter: string } }) {
  const chapter = findChapter(params.chapter);
  if (!chapter) return <LessonPage params={{ slug: [params.chapter] }} />;

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

/**
 * Every path one segment under `/learn`.
 *
 * One per chapter that has a folder - the other seven are not routes yet - plus
 * every page the collection holds at the top level, which is `about` and
 * `no-big-red-button`. Both kinds have to be here: what a static export writes
 * comes from this list, and so does what `next dev` agrees to serve.
 */
export function chapterParams() {
  const slugs = new Set(builtChapters().map((chapter) => chapter.slug));
  for (const page of getLearnPages()) {
    if (page.slugs.length === 1) slugs.add(page.slugs[0]);
  }
  return [...slugs].map((chapter) => ({ chapter }));
}

export function chapterMetadata({
  params,
}: {
  params: { chapter: string };
}): Metadata {
  const chapter = findChapter(params.chapter);
  if (!chapter) return lessonMetadata({ params: { slug: [params.chapter] } });

  return {
    title: chapter.intro?.title ?? chapter.title,
    description: chapter.intro?.description,
  };
}
