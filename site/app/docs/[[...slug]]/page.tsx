import { getPage, getPages } from "@/app/source";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultComponents from "fumadocs-ui/mdx";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: { slug?: string[] };
}) {
  const page = getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      {page.data.package && (
        <a
          href={`https://www.npmjs.com/package/@synthlet/${page.data.package}`}
        >
          <img
            className="rounded-full"
            alt="npm package"
            src={`https://img.shields.io/npm/v/@synthlet/${page.data.package}?label=@synthlet/${page.data.package}&color=%2322d3ee`}
          />
        </a>
      )}
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={{
            Tab,
            Tabs,
            ...defaultComponents,
          }}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const pages = getPages().map((page) => ({
    slug: page.slugs,
  }));

  return pages;
}

export function generateMetadata({ params }: { params: { slug?: string[] } }) {
  const page = getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  } satisfies Metadata;
}
