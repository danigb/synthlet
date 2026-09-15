import Link from "next/link";
import { Book } from "@/learn/kit/vocabulary";
import { playgroundHref } from "@/learn/playground/state";
import type { Stop } from "./tree";

/*
 * Everything on a lesson page that is not the lesson.
 *
 * All of it is computed at build time from the tree and the frontmatter, and
 * none of it is a choice any lesson makes: a lesson says what it wants the
 * reader to hear and which parts of the book it paraphrases, and *where those
 * two lines go on the page* is decided once, here, for all fifty-seven. That is
 * the same bargain the kit strikes with a patch, one layer out.
 */

/** The label above every chrome line: small, quiet, the same one every time. */
const LABEL =
  "text-xs font-semibold uppercase tracking-wide text-learn-ink-muted";

/**
 * What a lesson is waiting for, or nothing.
 *
 * `status` is `ready` or `blocked: <what it waits for>` (`learn/frontmatter.ts`),
 * and the half after the colon is a ticket or a module name the reader can look
 * up. Returning it rather than a boolean is what lets the placeholder name it.
 */
export function waitingOn(status: string | undefined): string | undefined {
  const match = /^blocked:\s*(.+)$/.exec(status ?? "");
  return match?.[1].trim();
}

/**
 * "Chapter 1 · Sound · 3 of 6".
 *
 * The one line that says where you are. Learning Synths puts it at the top of
 * every screen and it is most of why the course never feels like a pile of
 * pages.
 */
export function ChapterLine({
  number,
  title,
  url,
  position,
  of,
}: {
  /** The chapter's place in the section: "Get started" is 0. */
  number: number;
  title: string;
  url: string;
  /** 1-based, inside the chapter. */
  position: number;
  of: number;
}) {
  return (
    <p className="font-learn-text text-sm text-learn-ink-muted">
      <Link
        className="underline decoration-learn-border underline-offset-4 hover:text-learn-accent"
        href={url}
      >
        Chapter {number} · {title}
      </Link>
      <span> · </span>
      <span>
        {position} of {of}
      </span>
    </p>
  );
}

/**
 * "What to listen for".
 *
 * The lesson's success criterion, in the lesson's own words, in the same place
 * on every page. A reader who heard it is done; a reader who did not has
 * something specific to go back for.
 */
export function HearLine({ hear }: { hear: string }) {
  return (
    <section className="my-6 max-w-learn border-l-2 border-learn-accent pl-4 font-learn-text">
      <h2 className={LABEL}>What to listen for</h2>
      <p className="mt-1 text-learn-ink">{hear}</p>
    </section>
  );
}

/**
 * "From the book".
 *
 * Rendered by the chrome so that every lesson that owes something to Reid says
 * so in the same place, and with the kit's own `<Book>` so that there is one
 * Synth Secrets URL in the section. A lesson may still write `<Book>` inline
 * where a paragraph cites a part mid-argument; this is the page's citation, not
 * the paragraph's.
 */
export function BookLine({ book }: { book: number[] }) {
  return (
    <section className="my-6 max-w-learn font-learn-text">
      <h2 className={LABEL}>From the book</h2>
      {/* `<Book>` carries a lesson-sized block margin, which would push the
          citation away from the label it belongs to. It is a `<span class=
          "block">` rather than a `<p>` so that a lesson can also cite a part
          mid-sentence; see `kit/vocabulary.tsx`. */}
      <div className="[&>span]:my-1">
        <Book part={book} />
      </div>
    </section>
  );
}

/**
 * "Open in Playground".
 *
 * Only for a lesson whose widget is the voice, because the Playground *is* the
 * voice: opening a filter lesson's harmonics patch there would mean nothing.
 * The preset travels in the fragment, so the Playground arrives sounding like
 * the lesson did.
 */
export function PlaygroundLink({ preset }: { preset?: string }) {
  return (
    <p className="my-6 max-w-learn font-learn-text">
      <Link
        className="inline-block rounded-learn border border-learn-border px-3 py-2 text-sm text-learn-accent hover:border-learn-accent"
        href={playgroundHref({ preset })}
      >
        Open in Playground →
      </Link>
    </p>
  );
}

function Neighbour({
  stop,
  direction,
}: {
  stop: Stop;
  direction: "previous" | "next";
}) {
  const next = direction === "next";

  return (
    <Link
      className={`block rounded-learn border border-learn-border p-learn font-learn-text hover:border-learn-accent ${
        next ? "sm:text-right" : ""
      }`}
      href={stop.url}
      rel={direction}
    >
      <span className={`block ${LABEL}`}>{next ? "Next" : "Previous"}</span>
      <span className="mt-1 block text-learn-ink">
        {next ? `${stop.title} →` : `← ${stop.title}`}
      </span>
    </Link>
  );
}

/**
 * Previous and next, across chapter boundaries.
 *
 * A chapter break is a fact about the chapter line, not a gate: the last lesson
 * of Sound leads straight into the first of Envelopes, because that is how the
 * course is read.
 */
export function PrevNext({ previous, next }: { previous?: Stop; next?: Stop }) {
  if (!previous && !next) return null;

  return (
    <nav
      aria-label="Lessons"
      className="mt-12 grid max-w-learn grid-cols-1 gap-learn border-t border-learn-border pt-learn sm:grid-cols-2"
    >
      {previous ? <Neighbour stop={previous} direction="previous" /> : <span />}
      {next ? <Neighbour stop={next} direction="next" /> : null}
    </nav>
  );
}

/**
 * A lesson whose module does not exist yet.
 *
 * The prose is written and worth reading, so the page ships; what it cannot do
 * is pretend. The notice says what is missing and the placeholder stands where
 * the widget would be, both naming the thing being waited on so that a reader
 * who wants to know can go and look.
 */
export function BlockedNotice({ what }: { what: string }) {
  return (
    <aside className="my-6 max-w-learn rounded-learn border border-learn-border bg-learn-surface p-learn font-learn-text text-learn-ink">
      <p className={LABEL}>Not playable yet</p>
      <p className="mt-1">
        This lesson is written, but the module it needs is not finished. It
        waits on <code className="font-learn-mono">{what}</code>.
      </p>
    </aside>
  );
}

/** What stands where a blocked lesson's widget would be. */
export function BlockedPatch({ id, what }: { id?: string; what: string }) {
  return (
    <div
      // What a blocked lesson has instead of a widget. `check:sound` asserts
      // the placeholder is here and no `figure[data-patch]` is, which is a
      // stronger reading of "blocked" than matching on the prose above.
      data-blocked-patch={id ?? ""}
      className="my-6 max-w-learn rounded-learn border border-dashed border-learn-border bg-learn-bg p-learn font-learn-text text-learn-ink-muted"
    >
      <p className={LABEL}>The widget is not here yet</p>
      <p className="mt-1">
        {id ? (
          <>
            <code className="font-learn-mono text-learn-ink">{id}</code> waits
            on{" "}
          </>
        ) : (
          "This widget waits on "
        )}
        <code className="font-learn-mono text-learn-ink">{what}</code>.
      </p>
    </div>
  );
}
