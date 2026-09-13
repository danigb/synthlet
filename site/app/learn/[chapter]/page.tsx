import { ChapterPage, chapterMetadata, chapterParams } from "../chapter-page";

// `/learn/sound`. The page itself is in `app/learn/chapter-page.tsx`, because
// the route next door renders the same thing at `/learn/sound/`.
//
// A single dynamic segment beside the lesson catch-all: Next resolves the more
// specific one first, and `[...slug]` filters chapter indexes out of
// `generateStaticParams` so the two can never export to the same file.
export const generateStaticParams = chapterParams;
export const generateMetadata = chapterMetadata;

export default ChapterPage;
