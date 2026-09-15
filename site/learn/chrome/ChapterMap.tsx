import Link from "next/link";
import { LessonList } from "./LessonList";
import type { ChapterRef } from "./tree";

/*
 * The eleven chapters, written or not.
 *
 * A tutorial that lists only the chapters it has written looks like a tutorial
 * three lessons long, and a reader deciding whether to start deserves to see
 * the shape of the whole thing. So the chapters with no folder yet are drawn
 * too, greyed and honest about it; the day a content ticket adds the folder and
 * its line in `content/learn/meta.json`, the same entry becomes a link with its
 * lessons under it and nothing here changes.
 */
export function ChapterMap({ chapters }: { chapters: ChapterRef[] }) {
  return (
    <div className="my-6 max-w-learn">
      {chapters.map((chapter) => (
        <section key={chapter.slug} className="mt-6 font-learn-text">
          <h3 className="flex items-baseline gap-2 text-learn-ink">
            <span className="font-learn-mono text-sm text-learn-ink-muted">
              {chapter.number}
            </span>
            {chapter.built ? (
              <Link
                className="font-medium underline decoration-learn-border underline-offset-4 hover:text-learn-accent"
                href={chapter.url}
              >
                {chapter.title}
              </Link>
            ) : (
              <span className="font-medium text-learn-ink-muted">
                {chapter.title}
              </span>
            )}
          </h3>

          {chapter.built ? (
            <LessonList lessons={chapter.lessons} />
          ) : (
            <p className="mt-1 text-sm text-learn-ink-muted">
              Not written yet.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
