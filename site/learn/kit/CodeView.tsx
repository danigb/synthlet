"use client";

import { useState } from "react";
import type { CodeOptions } from "../patches/define";

/*
 * "View the code", and the code is the code.
 *
 * The text below is the patch file's own, loaded with `?raw` by the registry,
 * so there is no second copy anywhere and editing the patch changes both what
 * plays and what is shown. That is the promise the section makes that neither
 * of the two courses it is modelled on can: the sound you are hearing has a
 * file, and here it is.
 *
 * The manifest half is folded by default. A reader who opens this wants to see
 * `build` - the oscillator, the filter, the connection - and the list of
 * controls underneath it is the part they already have in front of them as
 * knobs. A patch narrows it further with `code: { lines }`, a slice of its own
 * file counted in the file's own line numbers - which is a thing a patch can
 * only count on because the text here is the file, not a compiler's rendering
 * of it. That is `next.config.mjs`'s job, and it was once a bug.
 *
 * **It is a plain `<pre>`, not highlighted.** The site's shiki pipeline runs at
 * build time inside `fumadocs-mdx`, and this is a client component: reaching it
 * would mean either shipping a highlighter to the browser or pre-rendering
 * every patch's HTML into the bundle, and neither is worth colour on a page
 * whose subject is sound. If a later ticket wants it, the change is here alone.
 */

/**
 * Where the manifest starts. Everything from this line is folded.
 *
 * `definePatch<Voice>({` as well as `definePatch({`: a patch whose `build`
 * returns a named type writes the parameter out, and a fold that missed it put
 * the whole manifest - fifty lines of controls - in front of a reader who had
 * asked to see the code that makes the sound.
 */
const MANIFEST = /^export default definePatch[<(]/;

/** The same lines without the empty ones at the end. */
function trimBlank(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  return lines.slice(0, end);
}

export function CodeView({
  id,
  source,
  code,
}: {
  id: string;
  source?: string;
  code?: CodeOptions;
}) {
  const [manifestOpen, setManifestOpen] = useState(false);

  if (!source) return null;

  let lines = source.replace(/\s+$/, "").split("\n");
  if (code?.lines) {
    const [from, to] = code.lines;
    lines = lines.slice(Math.max(0, from - 1), to);
  }

  const fold = lines.findIndex((line) => MANIFEST.test(line));
  // The head stops at the blank line a file leaves before `export default`, and
  // a blank line at the bottom of a code panel is a line of the reader's screen
  // spent on the fold rather than on the patch.
  const head = trimBlank(fold === -1 ? lines : lines.slice(0, fold));
  const tail = fold === -1 ? [] : lines.slice(fold);

  return (
    <details className="mt-learn border-t border-learn-border pt-2">
      <summary className="cursor-pointer font-learn-text text-sm text-learn-ink-muted hover:text-learn-accent">
        View the code
      </summary>

      <p className="mt-2 font-learn-mono text-xs text-learn-ink-muted">
        learn/patches/{id}.ts
        {code?.lines ? ` · lines ${code.lines[0]}–${code.lines[1]}` : null}
      </p>

      <pre className="mt-2 overflow-x-auto rounded-learn border border-learn-border bg-learn-bg p-3 font-learn-mono text-xs leading-relaxed text-learn-ink">
        <code>{head.join("\n")}</code>
      </pre>

      {tail.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={manifestOpen}
            className="mt-2 font-learn-text text-xs text-learn-ink-muted hover:text-learn-accent"
            onClick={() => setManifestOpen(!manifestOpen)}
          >
            {manifestOpen ? "Hide" : "Show"} the controls and views
          </button>
          {manifestOpen ? (
            <pre className="mt-2 overflow-x-auto rounded-learn border border-learn-border bg-learn-bg p-3 font-learn-mono text-xs leading-relaxed text-learn-ink">
              <code>{tail.join("\n")}</code>
            </pre>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
