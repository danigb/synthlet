import { LessonPage, lessonMetadata, lessonParams } from "../lesson-page";

// Every lesson: `/learn/sound/noise` and the fifty-six like it. The page itself
// is in `app/learn/lesson-page.tsx`, because `[chapter]` renders it too - for
// `about` and `no-big-red-button`, which are one segment under `/learn` and so
// never reach a catch-all.
//
// A required catch-all rather than the documentation's optional one, because
// `/learn` has a route of its own.
export const generateStaticParams = lessonParams;
export const generateMetadata = lessonMetadata;

export default LessonPage;
