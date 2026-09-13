import { getLearnPage, getLearnPages } from "@/app/learn-source";
import { lessonComponents } from "@/app/learn/lesson-components";
import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export default function LessonPage({ params }: { params: { slug: string[] } }) {
  const page = getLearnPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={lessonComponents} />
      </DocsBody>
    </>
  );
}

/**
 * Every lesson in the collection, and only the lessons.
 *
 * A required catch-all rather than the documentation's optional one, because
 * `/learn` has a route of its own. `index.mdx` has an empty slug, so it would
 * ask this route to export to the same path as `app/learn/page.tsx`; filtering
 * it out here is what keeps the two from colliding. Nothing else is filtered: a
 * lesson dropped into `content/learn/sound/` appears in the build without any
 * file under `app/` being touched.
 */
export function generateStaticParams() {
  return getLearnPages()
    .filter((page) => page.slugs.length > 0)
    .map((page) => ({ slug: page.slugs }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string[] };
}): Metadata {
  const page = getLearnPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
