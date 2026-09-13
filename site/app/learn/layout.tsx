import { HomeLayout } from "fumadocs-ui/home-layout";
import type { ReactNode } from "react";
import { baseOptions } from "../layout.config";

/**
 * The site header and nothing else.
 *
 * Deliberately not `DocsLayout`: a documentation sidebar sorts alphabetically
 * for people who already know the words, and a tutorial is read in the order it
 * was written. The chrome that says where you are in that order - chapter,
 * position, previous and next - is a later ticket; until then the header is all
 * there is, and a lesson reads like a documentation page, which is what "do not
 * restyle anything yet" asks for.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions}>
      <main className="container py-12">{children}</main>
    </HomeLayout>
  );
}
