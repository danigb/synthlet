import type { ReactNode } from "react";
import { MapFigure } from "./MapFigure";
import { Patch } from "./Patch";

/*
 * Everything a lesson is allowed to say, and the only place it is decided what
 * any of it looks like.
 *
 * Eight components with semantic props. A lesson writes `<Aside kind="why">`
 * and means "this is the physics"; whether that is a tinted box, a margin note
 * or a footnote is this file's business and a theme's, and changing it changes
 * every lesson at once. There is no ninth without the same conversation the
 * eighth had: whether the need is content or design, and the answer is almost
 * always a change here with no new tag. `<Map />` earned its place because the
 * section has exactly one picture of the catalogue and two pages draw it.
 *
 * No colour, no font, no radius and no spacing literal appears below - only
 * `learn-` classes bound to the tokens in `../theme`, plus layout utilities
 * that carry no design opinion. `rules.test.ts` rule 4 is what keeps it true.
 */

/**
 * Where a static figure is served from.
 *
 * `next.config.mjs` puts the whole site under `/synthlet`, and the docs
 * examples already spell that prefix out for their audio clip
 * (`examples/GraniteExample.tsx:11`). One constant here rather than a
 * dimensioned `next/image` on every figure: a lesson names a file and nothing
 * else, which is the rule, and `next/image` would make it name a width too.
 */
const FIGURES = "/synthlet/learn/figures";

export interface TryProps {
  children: ReactNode;
}

/**
 * Do this.
 *
 * The reader who is scanning for what to touch finds these and nothing else, so
 * they have to be visually distinct from prose - that is their whole
 * specification, and it is a design one, which is why it lives here.
 */
export function Try({ children }: TryProps) {
  return (
    <div className="my-6 max-w-learn rounded-learn border-l-4 border-learn-accent bg-learn-surface py-3 pl-4 pr-3 font-learn-text text-learn-ink">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-learn-accent">
        Try
      </p>
      {children}
    </div>
  );
}

export type AsideKind = "note" | "why" | "history";

/** What the three kinds are called on the page. */
const ASIDE_LABELS: Record<AsideKind, string> = {
  note: "Note",
  why: "Why",
  history: "History",
};

export interface AsideProps {
  kind: AsideKind;
  children: ReactNode;
}

/**
 * A box beside the flow.
 *
 * `why` is the physics - the paragraph that explains rather than instructs.
 * `history` is the instrument that did it first. `note` is everything else. The
 * distinction is the lesson's; how far each one sits from the text is not.
 */
export function Aside({ kind, children }: AsideProps) {
  return (
    <aside className="my-6 max-w-learn rounded-learn border border-learn-border bg-learn-bg p-learn font-learn-text text-learn-ink">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-learn-ink-muted">
        {ASIDE_LABELS[kind] ?? kind}
      </p>
      {children}
    </aside>
  );
}

export interface EpigraphProps {
  source: string;
  children: ReactNode;
}

/**
 * A short quotation, attributed.
 *
 * Short and attributed is not a style note: Reid's text is Sound On Sound's,
 * and the section's rule is that a sentence may be quoted where it is worth
 * quoting and a paragraph may not. The `source` prop is mandatory because an
 * unattributed quotation is the thing this component exists to prevent.
 */
export function Epigraph({ source, children }: EpigraphProps) {
  return (
    <blockquote className="my-6 max-w-learn border-l-2 border-learn-border pl-4 font-learn-text italic text-learn-ink-muted">
      {children}
      <footer className="mt-1 text-sm not-italic">— {source}</footer>
    </blockquote>
  );
}

export interface FigureProps {
  /** A file name under `site/public/learn/figures/`. Nothing else. */
  src: string;
  alt: string;
  caption?: string;
}

/**
 * A static picture. Rare, because the widget is the figure.
 */
export function Figure({ src, alt, caption }: FigureProps) {
  return (
    <figure className="my-6 max-w-learn">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static export
          with `images.unoptimized`; `next/image` would only add a mandatory
          width and height, which content must not carry. */}
      <img
        src={`${FIGURES}/${src}`}
        alt={alt}
        className="w-full rounded-learn border border-learn-border bg-learn-bg text-learn-ink"
      />
      {caption ? (
        <figcaption className="mt-2 font-learn-text text-sm text-learn-ink-muted">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** The series index. The archive's per-part URLs have three different shapes
 * across the five years it ran, none of them derivable from a part number, so
 * the citation links to the series and names the part. */
const SYNTH_SECRETS = "https://www.soundonsound.com/series/synth-secrets";

export interface BookProps {
  part: number | number[];
}

/**
 * The citation: which Synth Secrets part this lesson paraphrases.
 *
 * Every lesson that owes something to the book carries one, which is how the
 * section keeps the promise `content/learn/about.mdx` makes - paraphrased and
 * cited, never reproduced.
 *
 * A `<span class="block">` and not a `<p>`, although it is a paragraph in every
 * other way. Ten lessons write it on a line of its own, where MDX leaves it a
 * block in the flow and the two render identically; one - `sound/
 * sources-modifiers-controllers` - cites a part *mid-sentence*, which
 * `chrome/lesson-chrome.tsx` says a lesson may do, and there a `<p>` inside the
 * paragraph's `<p>` is markup no browser will accept: the parser closes the
 * outer one, React finds a tree it did not send, and re-renders the document.
 * Phrasing content is legal in both places, and `block` keeps the ten looking
 * exactly as they did. Found by `check:sound`.
 */
export function Book({ part }: BookProps) {
  const parts = Array.isArray(part) ? part : [part];
  const label =
    parts.length === 1
      ? `Part ${parts[0]}`
      : `Parts ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return (
    <span className="my-6 block max-w-learn font-learn-text text-sm text-learn-ink-muted">
      <a
        className="underline decoration-learn-border underline-offset-4 hover:text-learn-accent"
        href={SYNTH_SECRETS}
        rel="noreferrer"
        target="_blank"
      >
        Synth Secrets, {label}
      </a>
    </span>
  );
}

export interface TermProps {
  children: ReactNode;
}

/**
 * A word being defined, here, for the first time.
 *
 * `<dfn>` is exactly this in HTML, and it is what a glossary page will collect
 * when there is one. Marking them from the first lesson costs nothing and means
 * the glossary is a query rather than a rewrite.
 */
export function Term({ children }: TermProps) {
  return (
    <dfn className="font-learn-text font-medium not-italic text-learn-ink">
      {children}
    </dfn>
  );
}

/**
 * The picture of the catalogue: Part 63's three shelves.
 *
 * The one drawing in the section, and the only vocabulary word that renders
 * fixed content rather than the lesson's own. `MapFigure` is the component's
 * name everywhere else; `Map` is what a lesson writes, because in a lesson it
 * is "the map" and there is only one.
 */
export { MapFigure };
export { Patch };
export type { PatchProps } from "./Patch";

/**
 * The map the lesson page hands to MDX.
 *
 * A name that is not in here does not exist in a lesson - MDX renders an
 * unknown capitalised tag by throwing, and `rules.test.ts` rule 1 catches it
 * before a build does.
 */
export const learnVocabulary = {
  Patch,
  Try,
  Aside,
  Epigraph,
  Figure,
  Book,
  Term,
  Map: MapFigure,
};
