import { HomeLayout } from "fumadocs-ui/home-layout";
import type { ReactNode } from "react";
import { baseOptions } from "../layout.config";
import { LearnThemeSwitch } from "@/learn/theme/switch";

// The section's design tokens. Every `learn-` class the kit writes resolves
// through these custom properties.
import "@/learn/theme/default.css";
import "@/learn/theme/ink.css";
import "@/learn/theme/code.css";

/**
 * The theme the tutorial ships with.
 *
 * This word is the redesign. Change it to `"ink"` and every lesson page renders
 * in the second theme - different colours, different type, different corners,
 * different width - with no diff at all in `content/learn` or `learn/patches`.
 * That is the seam the whole section is built around, and it is a build-time
 * constant rather than a runtime choice so that shipping a redesign never
 * depends on a query string.
 */
const DEFAULT_THEME: "default" | "ink" = "default";

/**
 * The site header and nothing else.
 *
 * Deliberately not `DocsLayout`: a documentation sidebar sorts alphabetically
 * for people who already know the words, and a tutorial is read in the order it
 * was written. What says where you are in that order - the chapter line, the
 * position, previous and next - is the page's own chrome (`learn/chrome`), read
 * off the tree per lesson, because the order is the pedagogy and a sidebar
 * would bury it.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions}>
      {/* `?theme=ink` while developing, so the second theme can be looked at
          without editing the constant above. Webpack inlines `NODE_ENV`, so
          this branch and the component behind it are gone from the export. */}
      {process.env.NODE_ENV !== "production" ? <LearnThemeSwitch /> : null}
      {/* The attribute rides on the section's own element, not on `<html>`:
          custom properties inherit, so this reaches every lesson, and it leaves
          the documentation half of the site alone. */}
      <main
        className="container py-12 font-learn-text text-learn-ink"
        data-learn-theme={
          DEFAULT_THEME === "default" ? undefined : DEFAULT_THEME
        }
      >
        {children}
      </main>
    </HomeLayout>
  );
}
