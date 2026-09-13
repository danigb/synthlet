#!/usr/bin/env node
//
// Every `/learn/` link in the exported site points at a file that exists.
//
// The tutorial's pages link to each other constantly - a lesson to the next
// lesson, the map to every chapter, a chapter back to the map - and a static
// export gives no warning at all when one of those targets was never built. A
// chapter folder renamed, a lesson slug changed, a link written to a page that
// a later ticket has not landed yet: all of them build green and 404 in a
// browser. The documentation section already has thirty such links, because
// `fumadocs-core` drops `(group)` segments from slugs and nothing ever
// re-checked the URLs against the output (`thoughts/roadmap.md`). The tutorial
// keeps chapters as plain folders so it cannot acquire that bug the same way,
// and runs this so it cannot acquire it any other way.
//
//   npm --prefix site run check:links
//   node site/scripts/check-learn-links.mjs
//   node site/scripts/check-learn-links.mjs --out path/to/out --base /synthlet
//
// It reads the built HTML rather than the MDX sources on purpose: what a link
// resolves to is a property of the export, not of the prose, and it is the
// export that gets deployed.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";

const DEFAULT_OUT = resolve(import.meta.dirname, "..", "out");

/** `next.config.mjs` serves the whole site from a subdirectory. */
const DEFAULT_BASE = "/synthlet";

/**
 * Targets that are allowed not to exist yet, each with the reason and the
 * ticket that removes it. An entry here is a promise, so it names one.
 *
 * Keep this empty unless a lesson genuinely has to ship pointing at a page a
 * later ticket builds; a link to a page nobody is building is a dead link, not
 * an allowlisted one.
 */
const ALLOWLIST = new Map([]);

/** The section this checks. Everything else in the export is somebody else's. */
const SECTION = "/learn";

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (entry.endsWith(".html")) found.push(path);
  }
  return found;
}

/**
 * The URL path a page is served at, given the file it was exported to.
 *
 * `out/learn/sound/x.html` is served at `/learn/sound/x`, and
 * `out/learn/index.html` at `/learn/` - which is what a relative href on that
 * page resolves against.
 */
function urlOf(file, out) {
  const path = "/" + relative(out, file).split(/[\\/]/).join("/");
  return path.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
}

/**
 * Where a static host would look for `path`, in order.
 *
 * `<path>.html` first, then `<path>/index.html`, then the literal file. That is
 * GitHub Pages' order, and it is why the tutorial's front page is exported
 * both ways: `out/learn.html` answers `/learn` and `out/learn/index.html`
 * answers `/learn/`.
 */
function candidates(path, out) {
  const clean = path.replace(/\/+$/, "");
  return [
    join(out, `${clean}.html`),
    join(out, clean, "index.html"),
    join(out, clean),
  ];
}

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Every `/learn` link in one page, already absolute and already stripped of the
 * base path, the query and the fragment.
 *
 * A regex over the markup rather than a parse: the export is machine-written
 * HTML with quoted attributes, and the failure mode of a regex here - a link it
 * does not recognise - is caught by the "found no links at all" guard below.
 */
function learnLinks(html, pageUrl, base) {
  const links = new Set();

  for (const [, href] of html.matchAll(/href=["']([^"']+)["']/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // http:, mailto:, tel:
    if (href.startsWith("//")) continue; // protocol-relative, so external
    if (href.startsWith("#")) continue; // same page

    const withoutFragment = href.split("#")[0].split("?")[0];
    if (withoutFragment === "") continue;

    const absolute = withoutFragment.startsWith("/")
      ? withoutFragment
      : posix.resolve(posix.dirname(pageUrl + "x"), withoutFragment);

    const path =
      base && absolute.startsWith(base)
        ? absolute.slice(base.length) || "/"
        : absolute;

    if (path === SECTION || path.startsWith(`${SECTION}/`)) links.add(path);
  }

  return links;
}

function findings(out, base) {
  const dead = [];
  let checked = 0;

  for (const file of htmlFiles(out)) {
    const pageUrl = urlOf(file, out);
    const html = readFileSync(file, "utf8");

    for (const path of learnLinks(html, pageUrl, base)) {
      checked += 1;
      if (ALLOWLIST.has(path)) continue;
      if (candidates(path, out).some(exists)) continue;
      dead.push({ from: relative(out, file), to: path });
    }
  }

  return { dead, checked };
}

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
};

const out = resolve(flag("--out", DEFAULT_OUT));
const base = flag("--base", DEFAULT_BASE);

if (!exists(join(out, "index.html"))) {
  console.error(
    `check-learn-links: ${out} does not look like an export (no index.html).\n` +
      "Build the site first: DEPLOY=true npm --prefix site run build",
  );
  process.exit(1);
}

const { dead, checked } = findings(out, base);

// A checker that quietly checks nothing passes forever. If the export contains
// no `/learn` links at all, the section did not build or the markup changed
// shape, and either is worth failing on.
if (checked === 0) {
  console.error(
    `check-learn-links: found no ${SECTION} links anywhere in ${out}.\n` +
      "Either the section did not build, or the exported markup no longer\n" +
      "looks the way this script expects. Both need looking at.",
  );
  process.exit(1);
}

if (dead.length === 0) {
  const allowed =
    ALLOWLIST.size === 0 ? "" : ` (${ALLOWLIST.size} allowlisted)`;
  console.log(
    `check-learn-links: ${checked} ${SECTION} link${checked === 1 ? "" : "s"} all resolve${allowed}.`,
  );
  process.exit(0);
}

console.error(
  `check-learn-links: ${dead.length} dead ${SECTION} link${
    dead.length === 1 ? "" : "s"
  } of ${checked}.\n`,
);
for (const { from, to } of dead) {
  console.error(`  ${from}  ->  ${to}`);
}
console.error(
  "\nEither the page was never built - check `generateStaticParams` and the\n" +
    "file it should have come from - or the link is spelt wrong. A target that\n" +
    "a later ticket builds goes in this script's ALLOWLIST, with its reason.",
);
process.exit(1);
