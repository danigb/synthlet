import { getLearnPage, getLearnPages } from "@/app/learn-source";
import {
  blockedLessonComponents,
  lessonComponents,
} from "@/app/learn/lesson-components";
import {
  BlockedNotice,
  BookLine,
  ChapterLine,
  HearLine,
  PlaygroundLink,
  PrevNext,
  waitingOn,
} from "@/learn/chrome/lesson-chrome";
import { LessonKeys } from "@/learn/chrome/LessonKeys";
import { voiceReference } from "@/learn/chrome/lesson-patches";
import { MarkVisited } from "@/learn/chrome/MarkVisited";
import { findChapter, findLesson, neighbours } from "@/learn/chrome/tree";
import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * A lesson, and everything around it.
 *
 * The order is the ticket's: where you are, what this is, the lesson itself,
 * what you should have heard, where it comes from, where to go next. Every part
 * of it is read off the tree and the frontmatter, so a lesson file plus a line
 * in its chapter's `meta.json` is the whole of adding a lesson - there is
 * nothing under `app/` to edit, ever.
 *
 * `about.mdx` is a page in the collection and not a lesson: it is in no chapter,
 * so `findLesson` returns nothing and the page renders as a title, a
 * description and a body, which is exactly what it should be.
 */
export default function LessonPage({ params }: { params: { slug: string[] } }) {
  const page = getLearnPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const lesson = findLesson(params.slug);
  const chapter = lesson ? findChapter(lesson.chapterSlug) : undefined;
  const { previous, next } = neighbours(params.slug);
  const blocked = waitingOn(page.data.status);
  const voice = voiceReference(params.slug);
  const book = page.data.book;

  return (
    <>
      {lesson && chapter ? (
        <ChapterLine
          number={chapter.number}
          title={chapter.title}
          url={chapter.url}
          position={lesson.position}
          of={chapter.lessons.length}
        />
      ) : null}

      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>

      {blocked ? <BlockedNotice what={blocked} /> : null}

      <DocsBody>
        <MDX
          components={
            blocked ? blockedLessonComponents(blocked) : lessonComponents
          }
        />
      </DocsBody>

      {page.data.hear ? <HearLine hear={page.data.hear} /> : null}
      {book && book.length > 0 ? <BookLine book={book} /> : null}
      {voice ? <PlaygroundLink preset={voice.preset} /> : null}

      <PrevNext previous={previous} next={next} />

      {lesson ? <MarkVisited url={lesson.url} /> : null}
      <LessonKeys previous={previous?.url} next={next?.url} />
    </>
  );
}

/**
 * Every lesson in the collection, and only the lessons.
 *
 * A required catch-all rather than the documentation's optional one, because
 * `/learn` has a route of its own. Two kinds of page are filtered out, and both
 * for the same reason - another route already exports to that path:
 * `index.mdx`, whose slug is empty, belongs to `app/learn/page.tsx`, and a
 * chapter's `<chapter>/index.mdx`, whose slug is one segment, belongs to
 * `app/learn/[chapter]/page.tsx`. Nothing else is filtered: a lesson dropped
 * into `content/learn/sound/` appears in the build without any file under
 * `app/` being touched.
 */
export function generateStaticParams() {
  return getLearnPages()
    .filter((page) => page.slugs.length > 0 && page.file.name !== "index")
    .map((page) => ({ slug: page.slugs }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string[] };
}): Metadata {
  const page = getLearnPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
