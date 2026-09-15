import {
  ChapterPage,
  chapterMetadata,
  chapterParams,
} from "../../chapter-page";

// The same page as `/learn/sound`, exported to `out/learn/sound/index.html`.
//
// The section's front page is exported both ways for the reason
// `app/learn/index/page.tsx` explains - `trailingSlash` is off, so a static
// host asked for a directory has nothing to serve - and a chapter is a
// directory in the export too: `out/learn/sound/` really exists and holds the
// lessons. This gives it an index.
export const generateStaticParams = chapterParams;
export const generateMetadata = chapterMetadata;

export default ChapterPage;
