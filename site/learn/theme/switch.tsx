"use client";

import { useEffect } from "react";

/**
 * `?theme=ink`, in development only.
 *
 * The site is a static export, so no server ever sees a query string and the
 * theme cannot be chosen while rendering. It is chosen after mount instead, by
 * writing one attribute on `<html>` that `ink.css` is scoped to - which also
 * means the swap costs no re-render and nothing below it needs to know.
 *
 * The caller guards this with `process.env.NODE_ENV !== "production"`, which
 * webpack inlines, so neither the listener nor this component survives into the
 * export - the deployed site renders its default tokens with no client theme
 * code at all. Which theme *is* the default is `layout.tsx`'s `DEFAULT_THEME`,
 * and it is a build-time constant precisely so that shipping a redesign never
 * depends on a query string.
 */
export function LearnThemeSwitch() {
  useEffect(() => {
    const apply = () => {
      const theme = new URLSearchParams(window.location.search).get("theme");
      const root = document.documentElement;
      // Deleted rather than set to "default", so that the attribute selector
      // and the default `:root` block are the only two states that exist.
      if (theme) root.dataset.learnTheme = theme;
      else delete root.dataset.learnTheme;
    };

    apply();
    // Next's client router changes the URL without a reload, and the back
    // button changes it without going through the router.
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  return null;
}
