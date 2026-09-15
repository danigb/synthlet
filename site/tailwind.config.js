import { createPreset } from "fumadocs-ui/tailwind-plugin";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./examples/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    // The tutorial's kit and theme. Without this line every `learn-` class the
    // kit writes is scanned out of the stylesheet and the section renders
    // unstyled - and it fails silently, because Tailwind does not warn about a
    // class it never saw.
    "./learn/**/*.{ts,tsx}",
    "./content/**/*.{md,mdx}",
    "./mdx-components.{ts,tsx}",
    "./node_modules/fumadocs-ui/dist/**/*.js",
  ],
  presets: [
    createPreset({
      preset: "purple",
    }),
  ],
  theme: {
    extend: {
      // The tutorial's tokens, bound so that the kit can say
      // `bg-learn-surface` and mean `var(--learn-surface)`. Tailwind is what
      // the site already writes and what the kit's layout wants; custom
      // properties are what a theme swap wants. Binding one into the other
      // gives both, and leaves `rules.test.ts` a single prefix to grep for.
      colors: {
        learn: {
          bg: "var(--learn-bg)",
          surface: "var(--learn-surface)",
          ink: "var(--learn-ink)",
          "ink-muted": "var(--learn-ink-muted)",
          accent: "var(--learn-accent)",
          border: "var(--learn-border)",
          audio: "var(--learn-audio)",
          control: "var(--learn-control)",
        },
      },
      // Flat keys, not a nested `learn` object: Tailwind flattens nested
      // objects for `colors` and not for `fontFamily`, and the class names
      // wanted here are `font-learn-text` and `font-learn-mono`.
      fontFamily: {
        "learn-text": ["var(--learn-font-text)"],
        "learn-mono": ["var(--learn-font-mono)"],
      },
      borderRadius: {
        learn: "var(--learn-radius)",
      },
      spacing: {
        learn: "var(--learn-gap)",
      },
      maxWidth: {
        learn: "var(--learn-widget-max-width)",
      },
    },
  },
};
