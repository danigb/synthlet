import defaultComponents from "fumadocs-ui/mdx";

/**
 * Everything a lesson is allowed to say.
 *
 * A lesson never imports a component - that is the rule the whole section is
 * built around - so this map is the only place a name in an `.mdx` file can
 * come from. It is one constant on purpose: the content model swaps the docs'
 * defaults for the semantic vocabulary (`<Patch>`, `<Try>`, `<Aside>`,
 * `<Epigraph>`, `<Figure>`, `<Book>`) by editing this object and nothing else.
 */
export const lessonComponents = {
  ...defaultComponents,
};
