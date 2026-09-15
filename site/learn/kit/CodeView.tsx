"use client";

import { useRef, useState } from "react";
import { hasPatchSource, loadPatchSource } from "../patches";
import type { CodeOptions, PatchSource } from "../patches/define";

/*
 * "View the code", and the code is the code.
 *
 * The text below is the patch file's own, loaded with `?raw` by the registry,
 * so there is no second copy anywhere and editing the patch changes both what
 * plays and what is shown. That is the promise the section makes that neither
 * of the two courses it is modelled on can: the sound you are hearing has a
 * file, and here it is.
 *
 * It is fetched on the click that opens this panel (03c). A patch module
 * minifies and a patch's *source text* does not, so sixty of them made the
 * largest thing on a lesson page out of the one part of it nobody reads without
 * asking. `hasPatchSource` answers, with no fetch at all, whether there is a
 * panel to draw; opening it is what asks for the file.
 *
 * The manifest half is folded by default. A reader who opens this wants to see
 * `build` - the oscillator, the filter, the connection - and the list of
 * controls underneath it is the part they already have in front of them as
 * knobs. A patch narrows it further with `code: { lines }`, a slice of its own
 * file counted in the file's own line numbers - which is a thing a patch can
 * only count on because the text here is the file, not a compiler's rendering
 * of it. That is `next.config.mjs`'s job, and it was once a bug.
 *
 * **It is highlighted** (03b), by the same shiki the documentation's code
 * fences use and at the same time: build time. `?raw` hands this component the
 * file's text *and* the file's lines as markup (`scripts/highlight-patch.mjs`,
 * `scripts/patch-source-loader.cjs`), indexed identically - so everything below
 * slices and folds the text, which is the thing with line numbers in it, and
 * renders the lit lines at the same indices. No highlighter reaches the browser,
 * the panel costs the page nothing it did not cost before, and a patch whose
 * markup is missing falls back to the text rather than to a blank panel.
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

/*
 * The panel's own frame.
 *
 * `not-prose` because a lesson's widget sits inside the documentation's prose
 * styles, and those give every `<code>` a padded, bordered, tinted box - which
 * on an inline element wrapping forty lines is forty boxes, one per line
 * fragment. The lit panel is a code block and wants none of it; the tokens
 * below carry the only colour in here.
 */
const PANEL =
  "not-prose mt-2 overflow-x-auto rounded-learn border border-learn-border " +
  "bg-learn-bg p-3 font-learn-mono text-xs leading-relaxed text-learn-ink";

/**
 * One `<pre>`, from line `from` to line `to` of the file.
 *
 * `dangerouslySetInnerHTML` is the whole of the highlighting, and what makes it
 * safe is where the markup came from: `scripts/highlight-patch.mjs` built it
 * out of this repository's own files at build time, escaping every token it put
 * in, and no string a reader can influence reaches this component at all.
 */
function Lines({
  source,
  from,
  to,
}: {
  source: PatchSource;
  from: number;
  to: number;
}) {
  const lit = source.lines;

  return (
    <pre className={PANEL}>
      {lit ? (
        <code
          dangerouslySetInnerHTML={{ __html: lit.slice(from, to).join("\n") }}
        />
      ) : (
        <code>{source.text.split("\n").slice(from, to).join("\n")}</code>
      )}
    </pre>
  );
}

export function CodeView({ id, code }: { id: string; code?: CodeOptions }) {
  const [manifestOpen, setManifestOpen] = useState(false);
  const [source, setSource] = useState<PatchSource>();
  // A ref and not state: asking twice would be a second render for nothing,
  // and `<details>` fires its toggle on the way closed as well as open.
  const asked = useRef(false);

  const fetchSource = () => {
    if (asked.current) return;
    asked.current = true;
    void loadPatchSource(id).then((loaded) => {
      // The lines and the text have to be the same file, line for line, or the
      // slicing below would be counting in one and drawing from the other. The
      // text is the one that is always right, so a mismatch loses the colour.
      const lines = loaded?.lines;
      setSource(
        loaded && lines && lines.length !== loaded.text.split("\n").length
          ? { ...loaded, lines: null }
          : loaded,
      );
    });
  };

  // A patch with no registered source shows no panel at all, exactly as before:
  // the question is answered from the registry's keys, not from its files.
  if (!hasPatchSource(id)) return null;

  // Everything below counts in the file's own line numbers, from zero, so that
  // the text and the markup can be sliced by the same pair of indices.
  const lines = (source?.text ?? "").split("\n");

  // The blank line a file ends on is not a line of the panel.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;

  const from = code?.lines ? Math.max(0, code.lines[0] - 1) : 0;
  const to = code?.lines ? Math.min(end, code.lines[1]) : end;

  let fold = lines.findIndex((line) => MANIFEST.test(line));
  if (fold < from || fold >= to) fold = -1;

  // The head stops at the blank line a file leaves before `export default`, and
  // a blank line at the bottom of a code panel is a line of the reader's screen
  // spent on the fold rather than on the patch.
  let head = fold === -1 ? to : fold;
  while (head > from && lines[head - 1].trim() === "") head--;

  return (
    <details
      className="mt-learn border-t border-learn-border pt-2"
      onToggle={fetchSource}
    >
      <summary
        className="cursor-pointer font-learn-text text-sm text-learn-ink-muted hover:text-learn-accent"
        // The toggle event is the honest one - a panel that opens is a panel
        // that wants its file - but it is also asynchronous, and the click that
        // opened it is the last gesture the reader will make for a while.
        onClick={fetchSource}
      >
        View the code
      </summary>

      <p className="mt-2 font-learn-mono text-xs text-learn-ink-muted">
        learn/patches/{id}.ts
        {code?.lines ? ` · lines ${code.lines[0]}–${code.lines[1]}` : null}
      </p>

      {source ? <Lines source={source} from={from} to={head} /> : null}

      {source && fold !== -1 ? (
        <>
          <button
            type="button"
            aria-expanded={manifestOpen}
            className="mt-2 font-learn-text text-xs text-learn-ink-muted hover:text-learn-accent"
            onClick={() => setManifestOpen(!manifestOpen)}
          >
            {manifestOpen ? "Hide" : "Show"} the controls and views
          </button>
          {manifestOpen ? <Lines source={source} from={fold} to={to} /> : null}
        </>
      ) : null}
    </details>
  );
}
