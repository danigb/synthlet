import Link from "next/link";
import type { LessonRef } from "./tree";
import { VisitedMark } from "./VisitedMark";

/*
 * A chapter's lessons, in order.
 *
 * The same list on the map and on a chapter index, because they are the same
 * list: the map wants it short enough to scan eleven chapters of, the chapter
 * index wants each lesson's one-line description. One component, one prop.
 */

/** The mark on a lesson that is part of the twenty-two-lesson core path. */
function CoreMark() {
  return (
    <span
      title="On the core path"
      className="shrink-0 rounded-learn border border-learn-border px-1 text-xs uppercase tracking-wide text-learn-ink-muted"
    >
      core
    </span>
  );
}

export function LessonList({
  lessons,
  detail = false,
}: {
  lessons: LessonRef[];
  /** Show each lesson's description. The chapter index does; the map does not. */
  detail?: boolean;
}) {
  if (lessons.length === 0) return null;

  return (
    <ol className="my-4 max-w-learn font-learn-text">
      {lessons.map((lesson) => (
        <li
          key={lesson.url}
          className="border-t border-learn-border py-2 first:border-t-0"
        >
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-learn-mono text-xs text-learn-ink-muted">
              {lesson.position}
            </span>
            <Link
              className="min-w-0 text-learn-ink underline decoration-learn-border underline-offset-4 hover:text-learn-accent"
              href={lesson.url}
            >
              {lesson.title}
            </Link>
            {lesson.core ? <CoreMark /> : null}
            <VisitedMark url={lesson.url} />
          </div>
          {detail && lesson.description ? (
            <p className="ml-6 mt-1 text-sm text-learn-ink-muted">
              {lesson.description}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
