import { LearnIndexPage, learnIndexMetadata } from "../index-page";

// The same page as `/learn`, exported to `out/learn/index.html`.
//
// `next build` writes a route to `out/<route>.html` unless `trailingSlash` is
// on, which this site does not turn on because it would rewrite every
// documentation URL. `/learn` alone would therefore leave `out/learn/` - a real
// directory, the lessons live in it - without an index, and a static host asked
// for `/synthlet/learn/` would have nothing to serve. GitHub Pages' precedence
// between `learn.html` and `learn/index.html` is observed behaviour rather than
// anything GitHub documents, so rather than bet the section's front door on it,
// both exist. This is a second route, not a copy step: it renders the same
// `index.mdx` through the same component.
export const metadata = learnIndexMetadata;

export default LearnIndexPage;
