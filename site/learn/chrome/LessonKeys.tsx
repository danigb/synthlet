"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/*
 * The arrow keys move between lessons.
 *
 * A tutorial read in order should be turnable like a book, and the two keys
 * everybody already presses are the two the page has a use for. It costs a
 * listener and it is the only global key handler in the section.
 *
 * Except where a control wants them, and that is most of the exceptions below:
 * the kit's sliders and menus are real form elements, its toggle is a
 * `role="switch"` button, and its XY pad is a focusable `role="application"`
 * that nudges by 0.02 per press. A reader adjusting a filter with the keyboard
 * must not be navigated away from the lesson mid-sweep, so anything focusable
 * keeps its arrows.
 */
const INTERACTIVE = [
  "input",
  "textarea",
  "select",
  "button",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="application"]',
  '[role="slider"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function LessonKeys({
  previous,
  next,
}: {
  previous?: string;
  next?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // A browser shortcut is not a page turn: ⌘← is "back", alt+→ is "forward".
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE)) return;

      const to =
        event.key === "ArrowLeft"
          ? previous
          : event.key === "ArrowRight"
            ? next
            : undefined;
      if (!to) return;

      event.preventDefault();
      router.push(to);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous, router]);

  return null;
}
