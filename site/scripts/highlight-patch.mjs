//
// A patch file, tokenised by the same highlighter the documentation uses.
//
// "View the code" shows the file that makes the sound, and until 03b it showed
// it in a plain `<pre>` while every code fence in the documentation half of the
// same site was lit by shiki. The reason was structural: shiki runs at build
// time inside `fumadocs-mdx`, and the widget is a client component holding a
// string. So the highlighting moves to build time here instead - this module is
// called by a webpack loader (`patch-source-loader.cjs`) and by the matching
// Vite plugin in `vitest.config.ts`, and what reaches the browser is markup.
//
// **Colours are not in the markup.** The theme is shiki's own CSS-variables
// theme with the tutorial's prefix, so a token's colour arrives as
// `var(--learn-code-keyword)` - which this module turns into the *class*
// `learn-code-keyword`, because a class is a third of the bytes and because
// `learn/theme/code.css` is then the one file that says what a keyword looks
// like. `default.css` and `ink.css` give the names values, exactly as they do
// for everything else the section draws, and rule 4 stays true: no file outside
// `learn/theme/` contains a colour.
//
// One line in, one line out: `codeToTokens` tokenises per line and the array
// this returns is indexed the same as `source.split("\n")`, which is what lets
// `CodeView` slice a patch's `code: { lines }` range and fold its manifest
// while showing the lit version of the same lines.

import { createCssVariablesTheme, createHighlighter } from "shiki";

/**
 * The theme, which is not a theme: every token resolves to a CSS variable and
 * the four combinations of light, dark, default and ink resolve the variables.
 * `fontStyle: false` because a bold or italic run in a twelve-pixel monospace
 * panel is noise, and because it would be a second thing to theme.
 */
const THEME = createCssVariablesTheme({
  name: "learn",
  variablePrefix: "--learn-code-",
  fontStyle: false,
});

/** One highlighter per process: the WASM engine and the grammar cost a second. */
let starting;
const ready = () =>
  (starting ??= createHighlighter({ themes: [THEME], langs: ["ts"] }));

const ESCAPED = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escape = (text) =>
  text.replace(/[&<>]/g, (character) => ESCAPED[character]);

/**
 * `var(--learn-code-token-keyword)` → `learn-code-keyword`.
 *
 * Nothing for the foreground: most of a file is plain text, and a span that
 * says "this is the colour the `<pre>` already is" is bytes for nothing.
 */
function className(color) {
  const name = /^var\(--learn-code-(?:token-)?([\w-]+)\)$/.exec(
    color ?? "",
  )?.[1];
  return name && name !== "foreground" ? `learn-code-${name}` : undefined;
}

/**
 * The file's lines, as HTML, one string per line of `source`.
 *
 * Throws if shiki cannot start or the grammar cannot parse. The loader catches
 * that and ships the text alone, so a highlighter that breaks costs the reader
 * colour and not the panel.
 */
export async function highlightLines(source) {
  const shiki = await ready();
  const { tokens } = shiki.codeToTokens(source, { lang: "ts", theme: "learn" });

  return tokens.map((line) =>
    line
      .map((token) => {
        const name = className(token.color);
        const text = escape(token.content);
        return name ? `<span class="${name}">${text}</span>` : text;
      })
      .join(""),
  );
}
