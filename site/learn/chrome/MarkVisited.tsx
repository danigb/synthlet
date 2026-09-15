"use client";

import { useEffect } from "react";
import { useProgress } from "./progress";

/**
 * "I have read this one."
 *
 * Rendered by the lesson page and nothing else, so that the definition of
 * visited is exactly "opened", in one place. It draws nothing; the ticks it
 * causes are drawn by `VisitedMark` on the map and the chapter indexes.
 */
export function MarkVisited({ url }: { url: string }) {
  const { mark } = useProgress();

  useEffect(() => {
    mark(url);
  }, [mark, url]);

  return null;
}
