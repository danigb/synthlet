"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The two cable colours, for a canvas.
 *
 * A canvas cannot be styled: `strokeStyle` takes a resolved colour string and
 * nothing else, so the one place in the kit that has to *hold* a colour is the
 * one place that may not write one. `getComputedStyle(el).getPropertyValue`
 * would do it, except that it returns an empty string wherever the token has
 * not been reached - and the fallback for that would be a literal, which rule 4
 * forbids and rightly.
 *
 * So the tokens are read as a computed `color` instead. Two zero-size markers
 * carry `text-learn-audio` and `text-learn-control`, the browser resolves those
 * the way it resolves any colour on the page, and what comes back is always a
 * real value and always the theme's. No literal appears anywhere.
 *
 * A theme change is an attribute change - `.dark` from fumadocs' switch,
 * `data-learn-theme` from the section or from `?theme=ink` - so one observer
 * over those two attribute names is enough to restyle a running animation.
 */

export interface TokenColors {
  /** Reid's blue cable: the signal itself. */
  audio: string;
  /** Reid's black cable: gridlines, marks, everything that is not signal. */
  control: string;
}

export function useTokenColors() {
  const audioRef = useRef<HTMLSpanElement>(null);
  const controlRef = useRef<HTMLSpanElement>(null);
  const [colors, setColors] = useState<TokenColors>({
    audio: "",
    control: "",
  });

  useEffect(() => {
    const read = () => {
      const audio = audioRef.current
        ? getComputedStyle(audioRef.current).color
        : "";
      const control = controlRef.current
        ? getComputedStyle(controlRef.current).color
        : "";
      setColors((previous) =>
        previous.audio === audio && previous.control === control
          ? previous
          : { audio, control },
      );
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-learn-theme"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  /** Render these anywhere inside the widget. They take no space. */
  const markers = (
    <>
      <span
        aria-hidden
        className="block h-0 w-0 text-learn-audio"
        ref={audioRef}
      />
      <span
        aria-hidden
        className="block h-0 w-0 text-learn-control"
        ref={controlRef}
      />
    </>
  );

  return { colors, markers };
}
