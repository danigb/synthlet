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
 * knobs.
 *
 * **It is a plain `<pre>`, not highlighted.** The site's shiki pipeline runs at
 * build time inside `fumadocs-mdx`, and this is a client component: reaching it
 * would mean either shipping a highlighter to the browser or pre-rendering
 * every patch's HTML into the bundle, and neither is worth colour on a page
 * whose subject is sound. If a later ticket wants it, the change is here alone.
 */

/** Where the manifest starts. Everything from this line is folded. */
const MANIFEST = /^export default definePatch\(/;

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
  const head = fold === -1 ? lines : lines.slice(0, fold);
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
