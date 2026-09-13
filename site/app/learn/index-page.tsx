import { getLearnPage } from "@/app/learn-source";
import { lessonComponents } from "@/app/learn/lesson-components";
import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// `content/learn/index.mdx` is the one page in the collection whose slug is
// empty. Looking it up once, here, keeps both of the routes that render it
// (`/learn` and `/learn/index`) reading the same file.
const indexPage = getLearnPage([]);

export const learnIndexMetadata: Metadata = {
  title: indexPage?.data.title,
  description: indexPage?.data.description,
};

/**
 * The section's front page.
 *
 * Rendered from `index.mdx` by a route of its own rather than copied into place
 * from the first lesson the way `deploy:fix` does it for `/docs`. The front page
 * of a tutorial is the map of the whole thing; it cannot be a copy of lesson
 * one.
 */
export function LearnIndexPage() {
  if (!indexPage) notFound();

  const MDX = indexPage.data.body;

  return (
    <>
      <DocsTitle>{indexPage.data.title}</DocsTitle>
      <DocsDescription>{indexPage.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={lessonComponents} />
      </DocsBody>
    </>
  );
}
