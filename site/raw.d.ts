/**
 * `import source from "./harmonics.ts?raw"` - a module's own text.
 *
 * The rule that produces it is in `next.config.mjs`; vitest gets the same thing
 * for free, because Vite has understood `?raw` since its first release. This
 * declaration is the third party: TypeScript, which otherwise sees an import of
 * a file with an unknown extension.
 *
 * It lives at the site root rather than beside the patches on purpose:
 * `rules.test.ts` walks every `.ts` under `learn/patches/` and asks whether it
 * is a registered patch, and a `.d.ts` there would be reported as one that is
 * not.
 */
declare module "*?raw" {
  const source: string;
  export default source;
}
