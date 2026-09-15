//
// The webpack loader behind `import "./harmonics.ts?raw"`.
//
// It replaces `type: "asset/source"`, which returned the file's text and
// nothing else. The module it writes instead is that same text as the default
// export - unchanged, uncompiled, the whole of the 08b contract - plus the same
// lines highlighted at build time, which is 03b:
//
//     export default "import { Compound } from \"synthlet\";\n…";
//     export const lines = ["<span class=\"learn-code-keyword\">import</span>…"];
//
// One module rather than a second `?highlight` query, so that a chapter index
// still registers a patch in two lines and `learn/patches/*/index.ts` did not
// have to learn a third one. `raw.d.ts` declares both exports; `next.config.mjs`
// installs this loader and keeps SWC away from the request, without which the
// text would be SWC's output and the highlighting would be of the wrong file.
//
// **A failure here costs colour, not the panel.** If shiki cannot start, the
// module still exports the text and `lines` is `null`, `CodeView` falls back to
// its plain `<pre>`, and the build carries a warning that names the file.

const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

const HIGHLIGHTER = pathToFileURL(join(__dirname, "highlight-patch.mjs")).href;

module.exports = function patchSourceLoader(source) {
  const done = this.async();
  // The answer depends on nothing but the file, so webpack may keep it: the
  // loader runs for the server build and the client build of every patch.
  this.cacheable(true);

  import(HIGHLIGHTER)
    .then(({ highlightLines }) => highlightLines(source))
    .catch((error) => {
      this.emitWarning(
        new Error(
          `patch-source-loader: could not highlight this file, showing it ` +
            `plain (see site/learn/README.md, "View the code"): ${error.message}`,
        ),
      );
      return null;
    })
    .then((lines) => {
      done(
        null,
        `export default ${JSON.stringify(source)};\n` +
          `export const lines = ${JSON.stringify(lines)};\n`,
      );
    })
    .catch(done);
};
