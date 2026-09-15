import matter from "gray-matter";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAPTERS, CORE_PATH_SIZE } from "./chapters";

/*
 * The core path is a number in two places, so it is a test.
 *
 * `CORE_PATH_SIZE` is what the map's progress bar divides by, and `core: true`
 * in a lesson's frontmatter is what the reader actually walks. Nothing derives
 * one from the other - the denominator is declared so that a chapter failing to
 * build cannot quietly shorten the course - which means the two can disagree,
 * and for a while they did: the folder README said twenty-two, the content
 * tickets' tables said twenty, and a reader who finished every core lesson
 * would have seen "20 of 22" and a bar stopping at 91%.
 *
 * So: count the frontmatter on disk, compare, and name the files when it fails,
 * because "expected 21 to be 20" is not a number anybody can act on.
 */

const CHROME = dirname(fileURLToPath(import.meta.url));
const SITE = join(CHROME, "..", "..");
const CONTENT = join(SITE, "content", "learn");

function mdxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...mdxFiles(path));
    else if (entry.endsWith(".mdx")) found.push(path);
  }
  return found.sort();
}

/** How a file is named in a failure message: relative to `content/learn/`. */
const named = (path: string) => relative(CONTENT, path).split(sep).join("/");

/** Every lesson whose frontmatter says it is on the core path, by file. */
const corePages = mdxFiles(CONTENT)
  .filter((file) => matter(readFileSync(file, "utf8")).data.core === true)
  .map(named);

/**
 * The chapters the core path runs through.
 *
 * It ends with chapter 5: tickets 12, 13 and 14 each say "none are `core`" of
 * the chapters they write, so `Modulation` is the last chapter that can add to
 * this number and the count below is final rather than a waypoint.
 */
const CORE_CHAPTERS = CHAPTERS.slice(0, 6).map((chapter) => chapter.slug);

describe("the core path", () => {
  it("has as many lessons on disk as the chrome counts", () => {
    expect(
      corePages.length,
      `content/learn has ${corePages.length} lessons with \`core: true\` and ` +
        `CORE_PATH_SIZE is ${CORE_PATH_SIZE}. One of the two is wrong.\n` +
        corePages.map((page) => `  ${page}`).join("\n"),
    ).toBe(CORE_PATH_SIZE);
  });

  it("lets a reader who has read all of it see a full bar", () => {
    // The arithmetic `CoreProgress` does, with every core lesson visited.
    const total = Math.max(CORE_PATH_SIZE, corePages.length);
    expect(Math.round((corePages.length / total) * 100)).toBe(100);
  });

  it("stays inside the chapters that own it", () => {
    const strays = corePages.filter(
      (page) => !CORE_CHAPTERS.includes(page.split("/")[0]),
    );
    expect(
      strays,
      "chapters 6-10 carry no core lessons (tickets 12-14), so a `core: true` " +
        "there means either the lesson or CORE_PATH_SIZE needs revisiting",
    ).toEqual([]);
  });
});
