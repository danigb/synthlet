import defaultComponents from "fumadocs-ui/mdx";
import { learnVocabulary } from "@/learn/kit/vocabulary";

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
