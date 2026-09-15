import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/*
 * Which widget a lesson uses, without the lesson saying so twice.
 *
 * The chrome has one question to ask of a lesson's body: is its widget the
 * tutorial voice? If it is, the page offers "Open in Playground" with the
 * lesson's preset. Frontmatter could carry the answer, but then every voice
 * lesson would state its patch in two places and one of them would be wrong
 * eventually. So the answer is read off the `<Patch>` tag itself, which is
 * where it already is.
 *
 * A regex over the raw `.mdx`, not a parse: it is the same shape
 * `rules.test.ts` rule 3 reads, on the same files, and its failure mode - a
 * `<Patch>` written in some way this does not recognise - is a missing link
 * rather than a broken page. Frontmatter and code fences go first, so a fenced
 * example of a `<Patch>` tag is prose about a widget and not a widget.
 *
 * This runs at build time only: a server component imports it, a static export
 * evaluates it once, and none of it reaches the browser.
 */

export interface PatchReference {
  /** The patch's id, which is its path under `learn/patches`. */
  id?: string;
  /** The controls the lesson reveals, in the order it wrote them. */
  show?: string[];
  /** A named starting sound, for the patches whose `build` takes one. */
  preset?: string;
}

/** `<Patch …>` or `<Patch … />`. No attribute of it may contain a `>`. */
const PATCH_TAG = /<Patch\b([^>]*)>/g;

/** The frontmatter block, which is YAML and not prose. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function body(source: string): string {
  return source
    .replace(FRONTMATTER, "")
    .replace(/^```[\s\S]*?^```/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

/** Every `<Patch>` in one lesson's source, in the order they appear. */
export function patchReferencesIn(source: string): PatchReference[] {
  const references: PatchReference[] = [];

  for (const [, attributes] of body(source).matchAll(PATCH_TAG)) {
    const id = /\bid\s*=\s*"([^"]*)"/.exec(attributes)?.[1];
    const preset = /\bpreset\s*=\s*"([^"]*)"/.exec(attributes)?.[1];
    const list = /\bshow\s*=\s*\{\s*\[([^\]]*)\]/.exec(attributes)?.[1];
    const show = list
      ? [...list.matchAll(/["']([^"']+)["']/g)].map(([, name]) => name)
      : undefined;

    references.push({ id, show, preset });
  }

  return references;
}

/**
 * Where the lessons are, at build time.
 *
 * `process.cwd()` rather than this module's own path: webpack rewrites
 * `import.meta.url` to somewhere inside `.next/server`, and `next build`,
 * `next dev` and vitest all run from `site/`.
 */
const CONTENT = resolve(process.cwd(), "content", "learn");

function mdxFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...mdxFiles(path));
    else if (entry.endsWith(".mdx")) found.push(path);
  }
  return found;
}

/**
 * The slug a content file is served at.
 *
 * The same arithmetic `fumadocs-core` does, and it is this simple only because
 * the tutorial's chapters are plain folders: no route groups to drop, no
 * locales, no rewrites. `sound/index.mdx` is the chapter, `index.mdx` is the
 * map.
 */
function slugsOf(file: string): string[] {
  const parts = relative(CONTENT, file).split(sep);
  const last = parts.pop()?.replace(/\.mdx$/, "");
  if (last && last !== "index") parts.push(last);
  return parts;
}

function readIndex(): Map<string, PatchReference[]> {
  const index = new Map<string, PatchReference[]>();
  for (const file of mdxFiles(CONTENT)) {
    index.set(
      slugsOf(file).join("/"),
      patchReferencesIn(readFileSync(file, "utf8")),
    );
  }
  return index;
}

let index: Map<string, PatchReference[]> | undefined;

/** Every `<Patch>` in the lesson at these slugs. */
export function lessonPatchReferences(slugs: string[]): PatchReference[] {
  index ??= readIndex();
  return index.get(slugs.join("/")) ?? [];
}

/**
 * The lesson's voice widget, if it has one.
 *
 * `voice` is the one patch a lesson can share with the Playground, because it
 * is the one patch the Playground is.
 */
export function voiceReference(slugs: string[]): PatchReference | undefined {
  return lessonPatchReferences(slugs).find(
    (reference) => reference.id === "voice",
  );
}
