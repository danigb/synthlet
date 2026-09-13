import { getLearnPage, learnTree } from "@/app/learn-source";
import { CHAPTERS, plannedChapter, plannedNumber } from "./chapters";

/*
 * The tutorial's order, as the chrome needs to read it.
 *
 * Two sources, one direction. `learnTree` is the *order*: it is built from the
 * `meta.json` files, so a chapter's place and a lesson's place inside it are
 * decided by content and by nothing else. `getLearnPage` is the *data*: title,
 * description, and the four fields a lesson declares about itself. Nothing here
 * knows a lesson's name, which is the whole point - adding a file and a line to
 * a `meta.json` puts it in the navigation with no edit under `app/`.
 *
 * Everything is computed once, at module scope, because a static export builds
 * every page in one process and this is the same answer every time.
 */

type TreeNode = (typeof learnTree)["children"][number];
type TreeFolder = Extract<TreeNode, { type: "folder" }>;
type TreeItem = Extract<TreeNode, { type: "page" }>;

/** The section's own prefix. Every url in the tree starts with it. */
const BASE = "/learn";

export interface LessonRef {
  /** `/learn/sound/what-is-in-a-sound`. */
  url: string;
  slugs: string[];
  title: string;
  description?: string;
  /** One sentence: what the reader should be able to hear by the end. */
  hear?: string;
  /** The Synth Secrets parts this lesson paraphrases. */
  book?: number[];
  /** `ready`, or `blocked: <what it waits for>`. */
  status?: string;
  core: boolean;
  chapterSlug: string;
  /** 1-based, inside its own chapter. */
  position: number;
}

export interface ChapterIntro {
  slugs: string[];
  title: string;
  description?: string;
}

export interface ChapterRef {
  slug: string;
  /** Its place in `CHAPTERS`: "Get started" is 0. */
  number: number;
  title: string;
  /** `/learn/sound`. */
  url: string;
  /** False when the chapter is planned but has no folder yet. */
  built: boolean;
  lessons: LessonRef[];
  /** `<chapter>/index.mdx`, when the chapter wrote itself an intro. */
  intro?: ChapterIntro;
}

/** Somewhere the reader can go from here. */
export interface Stop {
  url: string;
  title: string;
}

/**
 * A tree node's name.
 *
 * `PageTree` types it as a `ReactNode` because a tree can carry icons and
 * markup. This one carries titles from `meta.json` and from frontmatter, which
 * are strings; anything else is not a name the chrome can print.
 */
function text(name: unknown): string {
  return typeof name === "string" ? name : "";
}

/** `/learn/sound/what-is-in-a-sound` -> `["sound", "what-is-in-a-sound"]`. */
function slugsOf(url: string): string[] {
  const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  return path.split("/").filter(Boolean);
}

/** The first page anywhere under a folder, which is how a folder is named. */
function firstItem(nodes: readonly TreeNode[]): TreeItem | undefined {
  for (const node of nodes) {
    if (node.type === "page") return node;
    if (node.type === "folder") {
      const found = firstItem(node.children);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * A chapter folder's slug.
 *
 * A `folder` node carries no url of its own - only its pages do - so the slug
 * is read off the first page under it. A folder with no page at all cannot be
 * named, cannot be linked, and is not a chapter.
 */
function folderSlug(folder: TreeFolder): string | undefined {
  const url = folder.index?.url ?? firstItem(folder.children)?.url;
  return url ? slugsOf(url)[0] : undefined;
}

function lessonOf(
  item: TreeItem,
  chapterSlug: string,
  position: number,
): LessonRef | undefined {
  const slugs = slugsOf(item.url);
  const page = getLearnPage(slugs);
  if (!page) return undefined;

  return {
    url: item.url,
    slugs,
    title: page.data.title ?? text(item.name),
    description: page.data.description,
    hear: page.data.hear,
    book: page.data.book,
    status: page.data.status,
    core: page.data.core === true,
    chapterSlug,
    position,
  };
}

function introOf(folder: TreeFolder): ChapterIntro | undefined {
  if (!folder.index) return undefined;
  const slugs = slugsOf(folder.index.url);
  const page = getLearnPage(slugs);
  if (!page) return undefined;
  return {
    slugs,
    title: page.data.title ?? text(folder.index.name),
    description: page.data.description,
  };
}

/**
 * The chapters that exist, in the order `content/learn/meta.json` puts them.
 *
 * A folder's lessons are exactly `folder.children`: `fumadocs-core` hangs a
 * folder's own `index.mdx` on `folder.index` and keeps it out of the children,
 * so a chapter intro is never mistaken for the chapter's first lesson.
 */
function readBuiltChapters(): ChapterRef[] {
  const chapters: ChapterRef[] = [];

  for (const node of learnTree.children) {
    if (node.type !== "folder") continue;
    const slug = folderSlug(node);
    if (!slug) continue;

    const lessons: LessonRef[] = [];
    for (const child of node.children) {
      if (child.type !== "page") continue;
      const lesson = lessonOf(child, slug, lessons.length + 1);
      if (lesson) lessons.push(lesson);
    }

    chapters.push({
      slug,
      // A folder nobody planned still gets a number, so that the page renders
      // rather than throwing. It sorts after the eleven.
      number: plannedNumber(slug) ?? CHAPTERS.length + chapters.length,
      title: text(node.name) || plannedChapter(slug)?.title || slug,
      url: `${BASE}/${slug}`,
      built: true,
      lessons,
      intro: introOf(node),
    });
  }

  return chapters;
}

const BUILT = readBuiltChapters();

const ALL: ChapterRef[] = CHAPTERS.map((planned, number) => {
  const built = BUILT.find((chapter) => chapter.slug === planned.slug);
  return (
    built ?? {
      slug: planned.slug,
      number,
      title: planned.title,
      url: `${BASE}/${planned.slug}`,
      built: false,
      lessons: [],
    }
  );
}).concat(BUILT.filter((chapter) => !plannedChapter(chapter.slug)));

const SEQUENCE: LessonRef[] = BUILT.flatMap((chapter) => chapter.lessons);

const BY_URL = new Map(SEQUENCE.map((lesson) => [lesson.url, lesson]));

/** The section's front page, as a place to go back to. */
const MAP: Stop = {
  url: BASE,
  title: getLearnPage([])?.data.title ?? "Learning Synthlet",
};

/** The chapters with a folder, in reading order. */
export function builtChapters(): ChapterRef[] {
  return BUILT;
}

/** All eleven, written or not, for the map. */
export function allChapters(): ChapterRef[] {
  return ALL;
}

/** Every lesson in reading order, chapter by chapter. Intros are not lessons. */
export function lessonSequence(): LessonRef[] {
  return SEQUENCE;
}

export function findLesson(slugs: string[]): LessonRef | undefined {
  return BY_URL.get(`${BASE}/${slugs.join("/")}`);
}

export function findChapter(slug: string): ChapterRef | undefined {
  return BUILT.find((chapter) => chapter.slug === slug);
}

/**
 * What is before and after a lesson, across chapter boundaries.
 *
 * The sequence is lessons only, so the last lesson of one chapter leads
 * straight into the first of the next - a chapter break is a fact about the
 * chapter line, not a page the reader has to pass through. Before the very
 * first lesson there is the map, because there has to be a way back.
 */
export function neighbours(slugs: string[]): {
  previous?: Stop;
  next?: Stop;
} {
  const url = `${BASE}/${slugs.join("/")}`;
  const at = SEQUENCE.findIndex((lesson) => lesson.url === url);
  if (at === -1) return {};

  const before = SEQUENCE[at - 1];
  const after = SEQUENCE[at + 1];

  return {
    previous: before ? { url: before.url, title: before.title } : MAP,
    next: after ? { url: after.url, title: after.title } : undefined,
  };
}

/** The urls of every core-path lesson that exists, for the progress bar. */
export function coreLessonUrls(): string[] {
  return SEQUENCE.filter((lesson) => lesson.core).map((lesson) => lesson.url);
}
