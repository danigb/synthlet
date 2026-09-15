/**
 * `import source from "./harmonics.ts?raw"` - a module's own text, and the same
 * lines highlighted.
 *
 * The rule that produces it is in `next.config.mjs`, which since 03b runs
 * `scripts/patch-source-loader.cjs` where it used to say `type: "asset/source"`;
 * `vitest.config.ts` carries the matching Vite plugin, so a test sees what the
 * browser will. This declaration is the third party: TypeScript, which
 * otherwise sees an import of a file with an unknown extension.
 *
 * It lives at the site root rather than beside the patches on purpose:
 * `rules.test.ts` walks every `.ts` under `learn/patches/` and asks whether it
 * is a registered patch, and a `.d.ts` there would be reported as one that is
 * not.
 */
declare module "*?raw" {
  const source: string;
  export default source;

  /**
   * The same file, one HTML string per line of `source`, or `null` where the
   * highlighter could not run. Indexed exactly as `source.split("\n")`, which
   * is what lets `kit/CodeView.tsx` slice a `code: { lines }` range and fold a
   * manifest while showing the lit version of the very same lines.
   */
  export const lines: string[] | null;
}
