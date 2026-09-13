import matter from "gray-matter";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lessonFrontmatter, LESSON_REQUIRED_FIELDS } from "./frontmatter";
import { learnVocabulary } from "./kit/vocabulary";
import { patches } from "./patches";
import { unknownControls } from "./patches/define";

/*
 * The one rule, as a test.
 *
 * "Content never carries design" is the architecture of this section, and a
 * convention survives exactly one contributor. So the five rules below read the
 * three directories and fail on the first `className` in a lesson, the first
 * `import` in a patch, the first `#fff` in the kit - each naming the file and
 * what it broke, because a rules failure that does not say which file is a
 * rules failure nobody fixes.
 *
 * Every rule collects its violations and asserts the list is empty, rather than
 * throwing on the first one: a contributor who broke a rule in four places
 * should see four lines, not four runs.
 */

const LEARN = dirname(fileURLToPath(import.meta.url));
const SITE = join(LEARN, "..");

const CONTENT = join(SITE, "content", "learn");
const PATCHES = join(LEARN, "patches");
const KIT = join(LEARN, "kit");
const THEME = join(LEARN, "theme");
const APP_LEARN = join(SITE, "app", "learn");

/** Every file under `dir` with one of `extensions`, or none if it is missing. */
function walk(dir: string, extensions: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) found.push(path);
  }
  return found.sort();
}

/** How a file is named in a failure message: relative to `site/`. */
const named = (path: string) => relative(SITE, path).split(sep).join("/");

/**
 * A lesson with its frontmatter and its code removed.
 *
 * Code fences are prose *about* code, so a fence containing the word `import`
 * is not an MDX import and must not be read as one. Inline code goes too, for
 * the same reason at sentence scale.
 */
function prose(source: string): string {
  return matter(source)
    .content.replace(/^```[\s\S]*?^```/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

// ---------------------------------------------------------------------------
// Rule 1
// ---------------------------------------------------------------------------

/** The seven, taken from the map itself so the two can never disagree. */
const VOCABULARY = new Set(Object.keys(learnVocabulary));

/**
 * Every opening or closing tag in a chunk of MDX.
 *
 * The lookahead is what keeps a markdown autolink out of it: `<https://sos>`
 * is followed by `:`, which is neither whitespace, `/` nor `>`, so it never
 * matches. Nor does prose arithmetic - `a < b` has a space after the `<`.
 */
const TAG = /<\/?([A-Za-z][A-Za-z0-9]*)(?=[\s/>])/g;

const FORBIDDEN_IN_CONTENT: [RegExp, string][] = [
  [/^[ \t]*(import|export)\s/m, "an import or export"],
  [/className/, "a className"],
  [/style\s*=/, "a style attribute"],
];

describe("rule 1: a lesson is prose and a vocabulary", () => {
  const lessons = walk(CONTENT, [".mdx"]);

  it("finds lessons to check", () => {
    expect(lessons.length).toBeGreaterThan(0);
  });

  it("lets no design into content/learn", () => {
    const violations: string[] = [];

    for (const file of lessons) {
      const text = prose(readFileSync(file, "utf8"));

      for (const [pattern, what] of FORBIDDEN_IN_CONTENT) {
        if (pattern.test(text)) {
          violations.push(`${named(file)}: rule 1 - contains ${what}`);
        }
      }

      for (const [, tag] of text.matchAll(TAG)) {
        if (!VOCABULARY.has(tag)) {
          violations.push(
            `${named(file)}: rule 1 - <${tag}> is not in the vocabulary ` +
              `(${[...VOCABULARY].join(", ")})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 2
// ---------------------------------------------------------------------------

/** `import x from "y"`, `import "y"`, `export * from "y"` - and `y?raw`. */
const SPECIFIER = /\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

/** The registry's own files. They map ids to modules; they are not patches. */
const isRegistryFile = (path: string) => path.endsWith(`${sep}index.ts`);

/**
 * A test sitting beside the patch it checks.
 *
 * It is not a patch - it is not registered, its path is not an id, and it may
 * import whatever a test needs, including the kit it is rendering. Excluded
 * from both halves of this rule rather than from one, because "is this file a
 * patch" has one answer.
 */
const isTestFile = (path: string) => /\.test\.tsx?$/.test(path);

function forbiddenImport(specifier: string): string | undefined {
  // `./harmonics.ts?raw` is the source the kit shows under "View the code"
  // (ticket 03). The query says how to load the file, not what it is.
  const spec = specifier.split("?")[0];

  if (/^react(-dom)?(\/|$)/.test(spec)) return "react";
  if (/^next(\/|$)/.test(spec)) return "next";
  if (/(^|\/)kit\//.test(spec)) return "the kit";
  if (/(^|\/)app\//.test(spec)) return "the app";
  return undefined;
}

describe("rule 2: a patch is synthlet code and a manifest", () => {
  const files = walk(PATCHES, [".ts", ".tsx"]).filter(
    (file) => !isTestFile(file),
  );

  it("imports nothing that knows what anything looks like", () => {
    const violations: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const [, from, bare] of text.matchAll(SPECIFIER)) {
        const specifier = from ?? bare;
        const what = forbiddenImport(specifier);
        if (what) {
          violations.push(
            `${named(file)}: rule 2 - imports ${what} ("${specifier}")`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("registers every patch under its own path", () => {
    const violations: string[] = [];

    const onDisk = files
      .filter((file) => !isRegistryFile(file) && !file.endsWith("define.ts"))
      .map((file) => relative(PATCHES, file).slice(0, -3).split(sep).join("/"));

    for (const id of onDisk) {
      if (!(id in patches)) {
        violations.push(
          `learn/patches/${id}.ts: rule 2 - not in the registry. ` +
            `Add "${id}" to its chapter's index.ts`,
        );
      }
    }

    for (const [key, patch] of Object.entries(patches)) {
      if (patch.id !== key) {
        violations.push(
          `learn/patches: rule 2 - registered as "${key}" but its id is ` +
            `"${patch.id}"; the two and the file path must be one name`,
        );
      }
      if (!onDisk.includes(key)) {
        violations.push(
          `learn/patches: rule 2 - "${key}" is registered but ` +
            `learn/patches/${key}.ts does not exist`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("gives every control an id of its own", () => {
    const violations: string[] = [];

    for (const [id, patch] of Object.entries(patches)) {
      const seen = new Set<string>();
      for (const control of patch.controls) {
        if (seen.has(control.id)) {
          violations.push(
            `learn/patches/${id}.ts: rule 2 - two controls called ` +
              `"${control.id}"; a lesson's show could not name either`,
          );
        }
        seen.add(control.id);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 3
// ---------------------------------------------------------------------------

/** `<Patch …>` or `<Patch … />`. No attribute of it may contain a `>`. */
const PATCH_TAG = /<Patch\b([^>]*)>/g;

interface PatchReference {
  file: string;
  id?: string;
  show?: string[];
  preset?: string;
}

function patchReferences(): PatchReference[] {
  const references: PatchReference[] = [];

  for (const file of walk(CONTENT, [".mdx"])) {
    const text = prose(readFileSync(file, "utf8"));
    for (const [, attributes] of text.matchAll(PATCH_TAG)) {
      const id = /\bid\s*=\s*"([^"]*)"/.exec(attributes)?.[1];
      const preset = /\bpreset\s*=\s*"([^"]*)"/.exec(attributes)?.[1];
      const showList = /\bshow\s*=\s*\{\s*\[([^\]]*)\]/.exec(attributes)?.[1];
      const show = showList
        ? [...showList.matchAll(/["']([^"']+)["']/g)].map(([, name]) => name)
        : undefined;
      references.push({ file, id, show, preset });
    }
  }

  return references;
}

describe("rule 3: every widget a lesson asks for is real", () => {
  const references = patchReferences();

  it("finds the lessons' patches", () => {
    expect(references.length).toBeGreaterThan(0);
  });

  it("resolves every id and every shown control", () => {
    const violations: string[] = [];

    for (const reference of references) {
      const { file, id, show } = reference;
      if (!id) {
        violations.push(`${named(file)}: rule 3 - a <Patch> with no id`);
        continue;
      }

      const patch = patches[id];
      if (!patch) {
        violations.push(
          `${named(file)}: rule 3 - no patch registered as "${id}"`,
        );
        continue;
      }

      for (const name of unknownControls(patch, show)) {
        violations.push(
          `${named(file)}: rule 3 - <Patch id="${id}"> shows "${name}", ` +
            `which is not one of its controls ` +
            `(${patch.controls.map((c) => c.id).join(", ")})`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("names a preset the voice actually has", async () => {
    // The voice patch arrives with the kit (ticket 03), and `preset` means
    // something only for it: every other patch's `build` ignores the option.
    // So the check switches itself on the day the registry gains a `voice` id,
    // rather than waiting for someone to remember to enable it.
    if (!("voice" in patches)) return;

    const { presets } = await import("./voice");
    const violations: string[] = [];

    for (const { file, id, preset } of patchReferences()) {
      if (id !== "voice" || !preset) continue;
      if (!(preset in presets)) {
        violations.push(
          `${named(file)}: rule 3 - preset "${preset}" is in neither ` +
            `preset bank of learn/voice`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 4
// ---------------------------------------------------------------------------

/** Tailwind's default palettes. A `learn-` colour is the only allowed one. */
const PALETTE =
  /-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)\b/;

const FORBIDDEN_IN_DESIGN: [RegExp, string][] = [
  [/(?<![\w#])#[0-9a-fA-F]{3,8}\b/, "a colour literal"],
  [/\brgba?\(/, "an rgb() colour"],
  [/\bhsla?\(/, "an hsl() colour"],
  [PALETTE, "a Tailwind palette class"],
  [/(?<![-\w])fd-[a-z][\w-]*/, "a documentation (fd-) token class"],
];

describe("rule 4: design is tokens, and only tokens", () => {
  // `theme/*.css` are the token files: they are where the literals live, and
  // the whole point of them is that they are the only place. Everything else
  // in the three design directories has to go through a `learn-` name.
  const files = [
    ...walk(KIT, [".ts", ".tsx"]),
    ...walk(THEME, [".ts", ".tsx"]),
    ...walk(APP_LEARN, [".ts", ".tsx"]),
  ];

  it("finds the kit and the chrome", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("writes no colour, and borrows no palette", () => {
    const violations: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const [pattern, what] of FORBIDDEN_IN_DESIGN) {
        const found = pattern.exec(text);
        if (found) {
          violations.push(
            `${named(file)}: rule 4 - ${what} ("${found[0]}"). ` +
              `Use a learn- class or var(--learn-…); add the token to ` +
              `learn/theme/default.css and learn/theme/ink.css if it is new`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 5
// ---------------------------------------------------------------------------

/** A lesson is an `.mdx` inside a chapter folder that is not that folder's
 * index. `content/learn/index.mdx` and `about.mdx` are pages, not lessons. */
function isLesson(file: string): boolean {
  const path = relative(CONTENT, file).split(sep);
  return path.length > 1 && path[path.length - 1] !== "index.mdx";
}

describe("rule 5: a lesson declares itself", () => {
  const files = walk(CONTENT, [".mdx"]);

  it("passes the schema", () => {
    const violations: string[] = [];

    for (const file of files) {
      const parsed = lessonFrontmatter.safeParse(
        matter(readFileSync(file, "utf8")).data,
      );
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          violations.push(
            `${named(file)}: rule 5 - ${issue.path.join(".") || "frontmatter"}: ${issue.message}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("gives every lesson its four lesson fields", () => {
    const violations: string[] = [];

    for (const file of files.filter(isLesson)) {
      const data = matter(readFileSync(file, "utf8")).data;
      for (const field of LESSON_REQUIRED_FIELDS) {
        if (data[field] === undefined) {
          violations.push(`${named(file)}: rule 5 - no "${field}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
