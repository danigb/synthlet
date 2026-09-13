import { Playground } from "@/learn/playground/Playground";
import { DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import Link from "next/link";

/*
 * The Playground: a route, not a lesson.
 *
 * Every other page under `/learn` comes out of `content/learn`, and this one
 * deliberately does not. A lesson is prose with a widget in it; this is a widget
 * with a sentence over it, and giving it an `.mdx` file would mean two routes
 * exporting to the same path - the catch-all builds every page in the
 * collection - for the sake of one paragraph.
 *
 * The paragraph is here instead, and it is the only prose in `app/learn` that is
 * about a particular page rather than about the shape of a page. That is a
 * deliberate exception and not a precedent: a second one means the Playground
 * wanted to be content after all.
 */

const TITLE = "Playground";
const DESCRIPTION =
  "The tutorial's synth with nothing hidden: every control, sixteen sounds, " +
  "a pad that moves several parameters at once, and a link you can send.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

export default function PlaygroundPage() {
  return (
    <>
      <DocsTitle>{TITLE}</DocsTitle>
      <DocsDescription>{DESCRIPTION}</DocsDescription>

      <p className="my-6 max-w-learn font-learn-text text-learn-ink">
        Pick a sound, play the keys — with a pointer, or the{" "}
        <code className="font-learn-mono">z</code> and{" "}
        <code className="font-learn-mono">q</code> rows of your computer
        keyboard — and then move something. Everything you change goes into the
        address bar, so the link at the top of this window is the sound you are
        hearing.
      </p>

      <Playground />

      <nav
        aria-label="Next"
        className="mt-12 max-w-learn border-t border-learn-border pt-learn font-learn-text"
      >
        <Link
          className="block rounded-learn border border-learn-border p-learn hover:border-learn-accent"
          href="/learn/no-big-red-button"
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-learn-ink-muted">
            Last page
          </span>
          <span className="mt-1 block text-learn-ink">No big red button →</span>
        </Link>
      </nav>
    </>
  );
}
