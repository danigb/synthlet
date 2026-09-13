import defaultComponents from "fumadocs-ui/mdx";
import { BlockedPatch } from "@/learn/chrome/lesson-chrome";
import { learnVocabulary, type PatchProps } from "@/learn/kit/vocabulary";

/**
 * Everything a lesson is allowed to say.
 *
 * A lesson never imports a component - that is the rule the whole section is
 * built around - so this map is the only place a name in an `.mdx` file can
 * come from. Two halves: fumadocs' renderers for plain markdown (headings,
 * paragraphs, lists, code fences), and the tutorial's own seven-word
 * vocabulary, which is where anything with a shape comes from.
 *
 * The vocabulary goes last, so a name it defines wins.
 */
export const lessonComponents = {
  ...defaultComponents,
  ...learnVocabulary,
};

/**
 * The same vocabulary, for a lesson whose module does not exist yet.
 *
 * A `blocked` lesson's prose is written and worth reading; what it cannot do is
 * build a widget out of a module nobody has merged. Swapping `Patch` for a
 * placeholder *here* is why neither the kit nor the lesson needs to know about
 * blocking: which component a tag resolves to is already this file's decision,
 * and whether a lesson is blocked is a fact the page reads off its frontmatter.
 */
export function blockedLessonComponents(what: string) {
  return {
    ...lessonComponents,
    Patch: ({ id }: PatchProps) => <BlockedPatch id={id} what={what} />,
  };
}
