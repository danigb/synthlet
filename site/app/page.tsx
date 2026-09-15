import { HomeLayout } from "fumadocs-ui/home-layout";
import Link from "next/link";
import { baseOptions } from "./layout.config";

/**
 * The site's front door, and the only page that has to say what to do next.
 *
 * It renders its own `HomeLayout` rather than a bare `<main>` so the header -
 * and with it the Repository / Documentation / Learn nav every other page on
 * the site carries - is present here too. Without it this was the one page a
 * first-time visitor sees and the one page with no way to the tutorial.
 *
 * Two sentences, two audiences: the tutorial for someone who does not yet have
 * the vocabulary, the documentation for someone who does.
 */
export default function HomePage() {
  return (
    <HomeLayout {...baseOptions}>
      <main className="flex min-h-[calc(100vh-3.5rem)] flex-col justify-center text-center">
        <h1 className="text-2xl font-bold">Synthlet</h1>
        <p className="mb-4 opacity-75 italic">
          Modular synthesis in your browser
        </p>
        <p className="text-fd-muted-foreground">
          New to synthesis? Start with{" "}
          <Link
            href="/learn"
            className="text-fd-foreground font-semibold underline"
          >
            Learning Synthlet
          </Link>
          , a tutorial you can hear: one idea at a time, one live patch, and the
          lines of code that made the sound.
        </p>
        <p className="text-fd-muted-foreground mt-2">
          You can open{" "}
          <Link
            href="/docs/quick-start"
            className="text-fd-foreground font-semibold underline"
          >
            docs/
          </Link>{" "}
          and see the documentation.
        </p>
      </main>
    </HomeLayout>
  );
}
