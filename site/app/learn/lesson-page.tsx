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

/*
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
 *
 * It lives here rather than in `[...slug]/page.tsx` for the reason
 * `chapter-page.tsx` and `index-page.tsx` do: two routes render it. The
 * catch-all serves every page two segments deep, and `[chapter]` serves the
 * ones a single segment deep that are not chapters, because Next resolves one
 * segment to the narrower route and never reaches the catch-all.
 */
export function LessonPage({ params }: { params: { slug: string[] } }) {
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
 * Every page in the collection that is more than one segment deep.
 *
 * Which is every lesson, and only lessons. The three kinds of page left out are
 * left out because a narrower route already owns that path: `index.mdx`, whose
 * slug is empty, belongs to `app/learn/page.tsx`; a chapter's
 * `<chapter>/index.mdx` and the two prose pages beside the chapters are one
 * segment, and belong to `app/learn/[chapter]/page.tsx` - which Next resolves
 * first for a single segment whether or not this route would have served it.
 * Nothing else is filtered: a lesson dropped into `content/learn/sound/`
 * appears in the build without any file under `app/` being touched.
 */
export function lessonParams() {
  return getLearnPages()
    .filter((page) => page.slugs.length > 1)
    .map((page) => ({ slug: page.slugs }));
}

export function lessonMetadata({
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
