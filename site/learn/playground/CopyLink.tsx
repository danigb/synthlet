"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The sound, as something you can send someone.
 *
 * There is no server here and nowhere to save a patch, so the patch *is* the
 * URL: the rig rewrites the fragment on every knob move, which makes
 * `location.href` always current and this button a two-line component rather
 * than a second encoder that would eventually disagree with the first.
 *
 * `navigator.clipboard` needs a secure context and a permission, and both of
 * them can say no. When they do, the field below it holds the link, selected, so
 * the reader can copy it the way people copied things before there was an API.
 */

/** Long enough to read "Copied", short enough not to look stuck. */
const SAID_MS = 1600;

export function CopyLink() {
  const [said, setSaid] = useState<"copied" | "select" | undefined>();
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      setSaid("copied");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaid(undefined), SAID_MS);
    } catch {
      setSaid("select");
      // The field renders on the next paint; selecting it is the fallback's
      // whole point, so it happens for the reader rather than being offered.
      requestAnimationFrame(() => field.current?.select());
    }
  };

  return (
    <section className="mt-learn border-t border-learn-border pt-learn font-learn-text">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-learn border border-learn-border bg-learn-bg px-3 py-1 text-sm text-learn-ink hover:border-learn-accent"
          onClick={copy}
        >
          Copy link
        </button>
        <span aria-live="polite" className="text-xs text-learn-ink-muted">
          {said === "copied"
            ? "Copied. The whole sound is in it."
            : "Everything you have moved travels in the address bar."}
        </span>
      </div>

      {said === "select" ? (
        <input
          ref={field}
          readOnly
          aria-label="The link to this sound"
          value={typeof window === "undefined" ? "" : window.location.href}
          className="mt-2 w-full rounded-learn border border-learn-border bg-learn-bg px-2 py-1 font-learn-mono text-xs text-learn-ink"
        />
      ) : null}
    </section>
  );
}
