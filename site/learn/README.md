# Learning Synthlet — the three layers

The tutorial at `/learn` has to be redesignable later without editing a lesson.
That is not a preference; it is the architecture, and `rules.test.ts` is the
part of it that fails the build when someone forgets.

Three layers, three directories, one direction of dependency:

| Layer       | Where                                                          | May contain                                                                                                                                              | May not                                                                           |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Content** | `site/content/learn/**/*.mdx` and `site/learn/patches/**/*.ts` | Prose, the eight-word vocabulary below, and patches: synthlet code plus a manifest of controls and views                                                 | `import`, `className`, `style`, raw HTML, React — anything that says how it looks |
| **Kit**     | `site/learn/kit/**`                                            | The components the vocabulary maps to, the control and view renderers, the widget frame. Props are semantic: a control has a `kind`, a `label`, a `unit` | Colour, font, radius or spacing literals. Tokens only                             |
| **Theme**   | `site/learn/theme/**`                                          | Design tokens as CSS custom properties, bound into Tailwind under a `learn-` prefix, one file per theme                                                  | Anything content-specific                                                         |

Chrome — the lesson page, navigation, progress — lives in `site/app/learn/**`
and is held to the kit's rule.

`site/learn/voice/` is a fourth thing and not a layer: the tutorial's own
synthesiser voice, site-only code with a README of its own.

## The vocabulary

Available in every lesson, nowhere else, and this is the whole list. It is
defined in `kit/vocabulary.tsx` and handed to MDX by
`app/learn/lesson-components.tsx`.

| Component                  | Props                                                   | Meaning                                                                                                                              |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `<Patch id show preset />` | `id: string`, `show?: string[]`, `preset?: string`      | The lesson's widget. `show` picks controls out of the patch's manifest, in the manifest's order; `preset` applies to the voice patch |
| `<Try>`                    | children                                                | An instruction to do something with the widget                                                                                       |
| `<Aside kind>`             | `kind: "note" \| "why" \| "history"`                    | A box beside the flow. `why` is the physics; `history` is the synth that did it first                                                |
| `<Epigraph source>`        | `source: string`                                        | A short quotation with attribution. `source` is mandatory                                                                            |
| `<Figure src alt caption>` | `src` is a file name under `site/public/learn/figures/` | A static picture. Rare — the widget is the figure                                                                                    |
| `<Book part>`              | `part: number \| number[]`                              | "Synth Secrets, Part 17", linked. The citation                                                                                       |
| `<Term>`                   | children                                                | A word being defined, marked up as `<dfn>` for the glossary page that does not exist yet                                             |
| `<Map />`                  | none                                                    | The picture of the catalogue: Part 63's three shelves. `/learn` draws the same component                                             |

Plus markdown: headings, paragraphs, lists, emphasis, links, code fences.

A lesson that wants a ninth component is a conversation about whether the need is
content or design. The answer is usually a change in `kit/` with no new tag; the
eighth, `<Map />`, is what the answer looks like when it is not. The section has
exactly one picture of the catalogue, two pages draw it, and a static copy under
`public/` would have kept its colours through a theme swap — so the drawing
became a word rather than a file.

## The tokens

`theme/default.css` sets them on `:root` and overrides them on `.dark`
(fumadocs toggles that class). They are the **only** place in the section where
a colour may be written.

| Token                      | Tailwind class                             | What it is                          |
| -------------------------- | ------------------------------------------ | ----------------------------------- |
| `--learn-bg`               | `bg-learn-bg`                              | The page behind everything          |
| `--learn-surface`          | `bg-learn-surface`                         | A raised panel: a widget, a `<Try>` |
| `--learn-ink`              | `text-learn-ink`                           | Body text                           |
| `--learn-ink-muted`        | `text-learn-ink-muted`                     | Captions, units, labels             |
| `--learn-accent`           | `text-learn-accent`, `border-learn-accent` | The one colour that means "here"    |
| `--learn-border`           | `border-learn-border`                      | Every rule and outline              |
| `--learn-audio`            | `text-learn-audio`                         | Reid's blue cable: audio signal     |
| `--learn-control`          | `text-learn-control`                       | Reid's black cable: control signal  |
| `--learn-font-text`        | `font-learn-text`                          | Prose                               |
| `--learn-font-mono`        | `font-learn-mono`                          | Code, ids, values                   |
| `--learn-radius`           | `rounded-learn`                            | Corner radius                       |
| `--learn-gap`              | `p-learn`, `gap-learn`, `m-learn`          | The section's one spacing step      |
| `--learn-widget-max-width` | `max-w-learn`                              | How wide a widget may get           |

The canvas views read `--learn-audio` and `--learn-control` with
`getComputedStyle` rather than a literal, so a scope trace restyles with
everything else.

**Adding a token**: add it to `theme/default.css` (both `:root` and `.dark`),
to `theme/ink.css`, to `tailwind.config.js` under `theme.extend`, and to this
table. A token that only one theme defines is a hole in the seam.

## How to redesign

Edit `theme/` and `kit/`. Nothing else. `git diff --stat content/learn
learn/patches` afterwards must be empty; if it is not, something in a lesson was
carrying design and the rules test should have caught it.

`theme/ink.css` is the proof that this works and ships from day one:
monochrome, serif, square, wider.

- **To make it the default**, change one word in `app/learn/layout.tsx`:
  `const DEFAULT_THEME = "ink"`. That is the whole redesign, and the diff on
  `content/learn` and `learn/patches` afterwards is empty.
- **To look at it while developing**, append `?theme=ink` to any lesson URL.
  The switch (`theme/switch.tsx`) is rendered only when
  `process.env.NODE_ENV !== "production"`, so the static export ships no theme
  code and never depends on a query string. It turns ink _on_; to go back,
  drop the parameter.

## How to add a lesson

1. Write `content/learn/<chapter>/<slug>.mdx`. Frontmatter:

   ```yaml
   title: Attack
   description: The first few milliseconds decide what instrument you hear.
   core: true # on the 22-lesson core path
   book: [7, 8] # Synth Secrets parts paraphrased; [] if none
   hear: A note that breathes in, and one that strikes.
   status: ready # or "blocked: learn-modules/01"
   ```

   The schema is `learn/frontmatter.ts`, used by both `source.config.ts` and
   rule 5. Chapter and order are **not** in the frontmatter: they come from the
   folder and its `meta.json`, so moving a lesson is moving a file.

2. Add the slug to `content/learn/<chapter>/meta.json`'s `pages`, in reading
   order.

3. If the chapter is new, create `content/learn/<chapter>/meta.json`
   (`{ "title": …, "pages": [ … ] }`). A chapter intro — `<chapter>/index.mdx` —
   is **not** listed in `pages`: `fumadocs-core` reads it off the folder and
   hangs it on `folder.index`, and naming it in `pages` would put it in the
   lesson list as well. **Its folder name is already in
   `content/learn/meta.json`'s `pages`**: all eleven chapters are listed there
   in reading order, and entries naming folders that do not exist yet are
   silently dropped, so writing the folder is the whole of publishing the
   chapter. The number and the name the map shows for a chapter before its
   folder exists are in `learn/chrome/chapters.ts`; once the folder is there,
   the folder's own `meta.json` title wins.

No route file is touched: `app/learn/[...slug]/page.tsx` enumerates the
collection.

## How to add a patch

1. Write `learn/patches/<chapter>/<name>.ts`. It imports `synthlet` and
   `../define`, and nothing else. `export default definePatch({ … })` with
   `id: "<chapter>/<name>"` — **the id is the path**.

2. Add one line to `learn/patches/<chapter>/index.ts`:

   ```ts
   export const <chapter>Patches = {
     "<chapter>/<name>": () => import("./name"),
   };
   ```

   and one to the `<chapter>Sources` object below it, which is the same file
   again as text (see ["View the code"](#view-the-code)):

   ```ts
   export const <chapter>Sources = {
     "<chapter>/<name>": () => import("./name.ts?raw"),
   };
   ```

3. If the chapter is new, add one line to `learn/patches/index.ts` spreading
   that chapter's two objects.

A file per chapter is why six people can add six chapters' patches at once
without meeting in the same file. The key, the `id` and the path are three
statements of one name, and rule 2 fails unless all three agree.

**Both values are `() => import()`, not the patch and not its text** (02c, 03c).
The registry has to be one object — rule 2 reads it, `<Patch>` resolves an id
against it — but nothing said the _bundle_ had to be one object, and with sixty
patches registered every lesson page carried all sixty modules and all sixty
source texts to show one. A table of thunks is a few hundred bytes:
`hasPatch(id)` answers the id from it, `kit/Patch.tsx` calls `loadPatch(id)` when
the widget mounts (drawing a frame of the widget's own size meanwhile, so the
page does not jump), and `kit/CodeView.tsx` calls `loadPatchSource(id)` on the
click that opens the panel. A test that wants the whole registry —
`rules.test.ts`, `diagrams.test.ts` — calls `loadPatches()`, which has no bundle
to care about.

The build contract, unchanged from the docs examples: return a `Compound`, own
everything you created so `dispose()` tears it down, and **arrive silent** — the
last node is a gain at 0 that the kit's Play toggle opens, on the click that
also resumes the context. Put the analyser _before_ that gain, so a silent
widget is still drawing.

## The kit

One widget, every lesson. `<Patch id="sound/harmonics" show={[...]} />` resolves
the patch in the registry, filters its controls, and hands both to
`kit/LessonWidget.tsx`, which is the only file in the section that decides what
a widget looks like.

| File                     | What                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `kit/LessonWidget.tsx`   | The frame: header (label, meter, Play), the views, the controls, the code                 |
| `kit/PlayToggle.tsx`     | The gate. A `button` with `aria-pressed`; opens the output gain and resumes the context   |
| `kit/useLessonPatch.ts`  | Build, gate, read, write, dispose — the widget's whole relationship with the audio thread |
| `kit/scale.ts`           | The four tapers: `lin`, `log`, `time`, `db`. `scale.test.ts` states them as arithmetic    |
| `kit/controls/*`         | One renderer per `Control.kind`, plus `Field.tsx`, the row they all sit in                |
| `kit/views/*`            | One per `View.kind`, plus `ViewFrame.tsx`                                                 |
| `kit/CodeView.tsx`       | The `?raw` source, fetched when the panel opens, manifest folded                          |
| `kit/useTokenColors.tsx` | The two cable colours, for the canvases                                                   |
| `kit/test-hooks.ts`      | `window.__learn__`, in non-production builds only                                         |

### Nothing is built until the reader touches it

The docs' rule is that a page must not arrive making a sound. The tutorial's is
one step stronger: **a lesson page arrives having built nothing at all** — no
`AudioContext`, no graph, no worklet. The first interaction with a widget builds
it, silently, because the patch ends in a gain at 0; Play, a key or a gate opens
that gain and resumes the context in the same gesture.

Two consequences worth knowing:

- A widget draws nothing before its first interaction. There is no analyser yet.
- A write that arrives before the build has finished is **queued**, not dropped,
  so dragging a slider the instant the page loads does what it looks like it
  does.

A patch whose compound is not usable the moment `build` returns — `Instrument`,
whose `params` are empty until its worklets register — exposes a `ready`
promise. The kit awaits it and reads no accessor before it resolves.

### The view options

| View       | Option                                    | What it does                                                                            |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `scope`    | `window: "wave" \| "contour"`, `seconds?` | `wave` is a few cycles; `contour` is a rolling peak history, which is an envelope       |
| `spectrum` | `marks: number[] \| (synth) => number[]`  | Frequencies ruled over the trace: the prediction beside the measurement, per frame      |
| `spectrum` | `minDb`, `maxDb`                          | Written onto the analyser; they are its display range                                   |
| `meter`    | `show: ("peak" \| "rms" \| "lufs")[]`     | Defaults to `["peak"]`. `lufs` turns on the `LevelMeter`'s loudness path                |
| `keyboard` | `octaves`, `from`                         | A view as well as a control, so a lesson's `show` cannot take the keys away — see below |
| `diagram`  | `compact`                                 | Drops the parameter port labels, for a diagram beside a narrow widget — see "Diagrams"  |

**A keyboard is drawn once, whoever names it.** It is the one kind a patch may
declare both ways, and a lesson is invited to name it: `voice` has keys as a
view _and_ a `keyboard` control, so `show={["keyboard"]}` can mean "the keys are
the control this page is about". The widget drops a control whose kind is
already on the patch's view list, so naming the keys changes nothing about what
is drawn — one keyboard, above the knobs, with or without the `show`. A lesson
that names some other control keeps them for the same reason: a view is never
filtered.

A patch may also set `code: { lines: [from, to] }` to open "View the code" on a
slice of its file rather than the whole of it. The numbers are the file's own
line numbers, 1-based and inclusive, and `to` is the file's last line: the range
is for skipping a header paragraph, not for cutting the manifest off, which the
panel folds on its own.

### "View the code"

`next.config.mjs` pushes one webpack rule — `resourceQuery: /raw/`,
`type: "asset/source"` — so a chapter index can import its own patch twice:

```ts
export const soundPatches = { "sound/harmonics": () => import("./harmonics") };
export const soundSources = {
  "sound/harmonics": () => import("./harmonics.ts?raw"),
};
```

The registry keeps the second beside the first and `loadPatchSource(id)` fetches
it. There is no second copy of any patch anywhere, which is the point: editing
`sound/harmonics.ts` changes both what plays and what is shown.

**The fetch happens when the panel opens** (03c). A patch module minifies and a
patch's source text does not — the voice's file is six kilobytes of text on its
own — so sixty of them were the largest single thing on a lesson page, and they
are the one part of it no reader sees without asking. `CodeView` asks on the
toggle; `hasPatchSource(id)` decides whether there is a panel to draw at all,
from the registry's keys and without fetching anything. A closed panel holds no
code at all, which is why `kit/code-view.test.tsx` opens one before it asserts
anything about what is in it.

The rule has a second half, and it is the reason the first half works. Webpack
has no "last rule wins": every rule whose conditions match a request applies to
it, and Next's own rule for `/\.(tsx|ts|js|mjs|jsx)$/` carries no `resourceQuery`
guard — so `./harmonics.ts?raw` matched both, `next-swc-loader` ran, and
`asset/source` stringified **its output**. The panels showed compiled
JavaScript, `code: { lines }` sliced a text whose line numbers belonged to
nobody, and because the client bundle lowers `??` and the server bundle does
not, the two `<pre>`s disagreed and React reported a hydration mismatch. So the
`webpack(config)` callback walks `config.module.rules` — recursing into the
`oneOf` arrays Next nests them in — and adds `resourceQuery: { not: [/raw/] }`
to every rule that tests a `.ts`, leaving `asset/source` alone with the request.
Reading a rule's `test` is the fiddly part: Next writes its own as
`{ or: [/\.(tsx|ts|js|cjs|mjs|jsx)$/, /__barrel_optimize__/] }`, not as a bare
regexp, and a walk that only understands regexps guards nothing that matters —
without failing. So the callback counts the rules it guarded that actually run
SWC, and throws when that count is zero: the failure it is preventing is silent,
the site still builds, and only the reader sees it.
`learn/kit/code-view.test.tsx` holds the other end of the contract, in vitest,
by asserting the registry's text still contains an annotation
(`ac: AudioContext`) that any compiler would have removed.

**It is a plain `<pre>`, not highlighted.** The site's shiki pipeline runs at
build time inside `fumadocs-mdx` and the widget is a client component; reaching
it would mean shipping a highlighter to the browser. If that becomes worth it,
the change is `kit/CodeView.tsx` alone.

### Colours on a canvas

A canvas cannot be styled, and rule 4 forbids the kit from writing a colour. So
`kit/useTokenColors.tsx` renders two zero-size markers carrying
`text-learn-audio` and `text-learn-control`, reads their resolved `color`, and
re-reads it when `class` or `data-learn-theme` changes anywhere above — which is
both the dark switch and `?theme=ink`. No literal, and a running scope restyles.

### The test hooks

In any build where `process.env.NODE_ENV !== "production"` the kit publishes:

```ts
window.__learn__.level(); // dBFS of the loudest mounted widget; -Infinity when silent
window.__learn__.live(); // built synths plus live meter taps; 0 is a clean page
```

Webpack inlines `NODE_ENV`, so the deployed export ships neither. Ticket 15's
headless pass reads them; so can you, in `next dev`.

### Every lesson makes a sound

```sh
npm --prefix site run check:sound
npm --prefix site run check:sound -- --only /learn/filters   # one chapter
npm --prefix site run check:sound -- --headed                # watch it
```

`scripts/check-learn-sound.mjs` starts `next dev` on a free port, walks every
page under `/learn` in reading order in one browser page, and asserts four
things:

- the page arrives **silent** — `level()` is exactly `-Infinity`, because
  before the first interaction no probe is registered at all;
- **nothing is left live** from the page before it — `live()` is 0;
- every widget **makes a sound** above −60 dBFS within three seconds of Play,
  a gate press or the `z` key, in that order;
- the **console is clean**, but for the `/favicon.ico` 404, which is a request
  the document makes outside the `/synthlet` base path.

It walks by clicking the page's own `Next` link wherever there is one, so the
leak assertion is made across a **client-side** navigation. A `page.goto` would
destroy the JavaScript context and make it vacuous; the summary counts the soft
transitions so a run that lost them is visible.

**It needs a browser** — Chrome or Chromium, resolved at run time, because
`playwright-core` downloads none: `CHROME_PATH`, then the system Google Chrome,
then whatever `npx playwright install chromium` has left in the cache.

**It runs `next dev`**, so it wants the same lock a `DEPLOY=true` build does:
both write `site/.next`. And it has to — `hooksEnabled` is gated on `NODE_ENV`,
so an exported page has no `window.__learn__` at all, which is the other half
of the check: `npm --prefix site run check:sound -- --export out` loads an
exported page and fails if the hooks are there.

When it fails:

- **live objects arrived from the page before** — a compound whose `dispose()`
  does not tear down everything it made. It is named on the page after the one
  with the bug, and both slugs are printed.
- **silent after Play, a gate press and a key** — usually a patch that does not
  end in a gain, so there is nothing for Play to open (`outputGain()` in
  `kit/useLessonPatch.ts`); or a patch that needs a note and shows neither a
  `gate` control nor a keyboard for the pass to press.
- **Play is disabled** — the patch's `ready` never resolved, and the console
  line beside it says which one.
- **a dirty console** — most often a hydration error: markup no browser will
  accept, which React answers by re-rendering the whole document.

What it does **not** catch is a misspelled `exposes` name. `useLessonPatch`
swallows a dead accessor on purpose — "a dead accessor is a manifest bug, not a
render error" — so the control quietly does nothing and the page still makes a
sound. Rule 3 in `learn/rules.test.ts` owns that one, without a browser.

### The shared audio components

`site/components/audio/` holds the parts both sections use: `Scope`,
`Spectrum`, `Keyboard`, `MasterMeter`, `SynthSlot`, `PatternView` and
`useSynth`. The docs' `Slider`, `Selector` and `ExamplePane` stay with the docs;
the kit's controls are its own. Where the kit needed something of them the docs
did not have — a trace colour, key colours, spectrum marks — it is an optional
prop whose default is exactly what the documentation rendered before.

## The manifest

`patches/define.ts` is the whole type surface, and it imports nothing.

- `Control.kind`: `slider | select | toggle | xy | gate | keyboard | button`
- `scale`: `lin | log | db | time`; `unit` is a string the kit prints
- `View.kind`: `scope | spectrum | meter | keyboard | pattern | diagram`, each
  with its own optional `options` bag (`scope.window`, `spectrum.marks`,
  `meter.show`, …) — see "The view options" above
- `code`: `{ lines: [from, to] }`, the slice "View the code" opens on
- `Diagram`: `"auto"` — reserved for `graph()` — or `{ nodes, edges }`; see
  "Diagrams" below for the declared form
- `resolveControls(patch, show)` filters by `show` in **manifest** order;
  `unknownControls(patch, show)` is what rule 3 reports

A control's `param` is any `{ value: number }`: an `AudioParam`, or a plain
accessor on the compound's `exposes` for something that is not one (a harmonic
count that rebuilds a table, a waveform index that has to reach two
oscillators). The kit never needs to know which it was handed.

## Diagrams

Every figure in Synth Secrets is a block diagram — blue cables for audio, black
for control (Part 41) — and the `diagram` view is the tutorial's. It is drawn
layered left to right: sources, modifiers, the output, with controllers hanging
underneath and their cables running up into a **named parameter port**.

### Declaring one

```ts
diagram: {
  nodes: [
    { id: "osc", label: "PolyblepOscillator", kind: "source", exposedAs: "osc" },
    {
      id: "amp",
      label: "AdsrAmp",
      kind: "modifier",
      exposedAs: "amp",
      controls: ["attack"],
    },
    { id: "out", label: "out", kind: "output" },
    { id: "keys", label: "keyboard", kind: "controller" },
  ],
  edges: [
    { from: "osc", to: "amp" },
    { from: "amp", to: "out" },
    // A control edge: it names the port it arrives at, and is drawn in the
    // other colour.
    { from: "keys", to: "amp", param: "gate" },
  ],
},
```

| Field           | Meaning                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | Unique in the diagram. Edges use it; nothing else does                                                                                                                                                 |
| `label`         | **The library's name for the module** — `PolyblepOscillator`, `Svf`, `AdsrAmp`. A box the reader can search the docs for                                                                               |
| `kind`          | `source`, `modifier`, `controller`, `output`. Optional: without it the edges decide (nothing feeds it → source, it feeds nothing → output). `controller` and `output` are the two that are not modules |
| `exposedAs`     | The key, or keys, on the compound's `exposes` this box is. Required on a `source` or a `modifier`, and checked                                                                                         |
| `controls`      | Control ids marked on the box, for the ones a name cannot tie                                                                                                                                          |
| `edges[].param` | Set on a control edge: the parameter it arrives at. Absent on an audio edge                                                                                                                            |

**How a control reaches its box.** A control is marked on the box whose
`exposedAs` contains the control's **id** — `harmonics` and `strip` in
`sound/harmonics` are exposes keys _and_ control ids, so nothing declares them
twice — and `controls: [...]` names the rest: `cutoff` writes
`s.filter.frequency`, whose key is `filter`, so the filter's box names it. An
accessor is a function and cannot be read, which is why the tie is declared.

That tie is also the hover link: pointing at a knob outlines its box, pointing
at a box outlines its knobs, and tabbing to a knob does the same as pointing at
it. Both halves are reachable without a pointer — "Reaching it without a
pointer" below.

### What the test checks

`learn/diagrams.test.ts` **builds every patch that declares a diagram** on an
`OfflineAudioContext` (`node-web-audio-api`, the harness the voice tests use)
and asks the compound. Each failure names the patch and the box:

- every node id unique, every edge endpoint declared, no edge to itself, no box
  with no cable
- every capitalised label on a `source` or `modifier` is a name that patch
  **imports from synthlet**
- every `source` and `modifier` carries `exposedAs`, and every key in it is
  really on the built compound
- every `param` edge arrives at a real `AudioParam` or `{ value }` accessor
- every id in `controls` is really one of the patch's controls

An environment with no `OfflineAudioContext` falls back to parsing `exposes` out
of the source, and the suite's own describe title says which of the two ran.

### `"auto"`, and what it is waiting for

`diagram: "auto"` asks the library to enumerate the running compound. That is
`graph()` — `thoughts/tickets/graph-introspection.md` — and it has not landed,
so `kit/views/auto-graph.ts` looks for the export and a patch that asks for
`"auto"` today draws **nothing**: no picture, no error. The renderer is already
the one both forms feed (`layout.ts` converts either into one `DiagramGraph`),
so the day `graph()` ships, a declared diagram can be replaced by `"auto"` one
patch at a time.

### The drawing

`kit/views/layout.ts` is a pure layering pass — longest path over the audio
edges, controllers in the column of what they control, a row underneath — and no
library. `kit/views/DiagramView.tsx` turns it into SVG: cables in
`--learn-audio` and `--learn-control`, boxes in `--learn-bg` outlined in
`--learn-border` with `--learn-radius` corners, so `?theme=ink` changes the
cable colours and squares the boxes and moves nothing. A diagram wider than the
widget scrolls sideways inside it — the one place the site allows a horizontal
scroll container, because a diagram scaled to fit 400 px is a diagram nobody can
read.

### Reaching it without a pointer

The diagram is **one tab stop, not one per box**: the boxes carry a roving
`tabindex` — the one the reader last visited holds it — and the arrow keys walk
the chain in either direction, wrapping at both ends. A five-box diagram in
front of a page of knobs must not cost five stops.

- A **focused** box sets the same link a hovered one does, so the knobs light up
  identically and the box outlines itself in `--learn-accent`, which is also its
  focus indicator.
- `Escape` puts the link down without taking the focus off the picture.
- A **tap** on a box sets the link — the only way a reader with no hover has of
  asking — and a tap on the drawing's background clears it.
- Each box is a `role="group"` named for the knobs printed on it: "Svf, Cutoff
  and Strip harmonics" (`describeNode` in `kit/views/layout.ts`). That is why
  the `<svg>` is a `role="group"` rather than a `role="img"` — that role takes
  everything inside it out of the accessibility tree, and the boxes are in it
  now. Its own `aria-label` is unchanged: the chain as a sentence.

The chrome's `←`/`→` page turn stands down for anything with a tab stop
(`LessonKeys`), so walking a diagram does not turn the lesson.

## The chrome

The kit draws a widget; the chrome draws everything around it — where you are,
where you go next, how far you have read. It lives in two places and is held to
the kit's rule: tokens only, no literal, rule 4 walks it.

| Where             | What                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/learn/**`    | The routes. `page.tsx` (the map), `[chapter]/page.tsx` and `[chapter]/index/page.tsx` (a chapter, both ways), `[...slug]/page.tsx` (a lesson), plus `index-page.tsx`, `chapter-page.tsx` and `lesson-components.tsx`, which are not routes |
| `learn/chrome/**` | Everything the routes are made of: the plan, the tree reader, the client pieces, the map figure                                                                                                                                            |

### The navigation model

`learn/chrome/tree.ts` is the only file that reads `learnTree`, and it reads it
one way: **the tree is the order, the page is the data**. Order comes from the
`meta.json` files, so where a chapter sits and where a lesson sits inside it are
decided by content; title, description, `core`, `book`, `hear` and `status` come
from `getLearnPage`. Nothing in `app/learn` knows any lesson's name.

| Export                                   | What it gives                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `builtChapters()`                        | The chapters that have a folder, in reading order                                            |
| `allChapters()`                          | All eleven, written or not, for the map                                                      |
| `lessonSequence()`                       | Every lesson, flat, in reading order. Chapter intros and `about.mdx` are not in it           |
| `findLesson(slugs)`, `findChapter(slug)` | One of them                                                                                  |
| `neighbours(slugs)`                      | `{ previous, next }`, across chapter boundaries; the map is the stop before the first lesson |
| `coreLessonUrls()`                       | The core path that exists, for the progress bar                                              |

`learn/chrome/chapters.ts` is the plan the tree is measured against: `CHAPTERS`
(eleven `{ slug, title }`, and a chapter's **number is its index** — "Get
started" is chapter 0) and `CORE_PATH_SIZE`, the progress bar's denominator.

### What a lesson page shows, and where it comes from

| On the page                  | From                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------ |
| "Chapter 1 · Sound · 3 of 6" | the tree                                                                       |
| Title, description           | frontmatter                                                                    |
| The body                     | the MDX                                                                        |
| "What to listen for"         | `hear`                                                                         |
| "From the book"              | `book`, rendered with the kit's own `<Book>` so there is one Synth Secrets URL |
| "Open in Playground"         | a `<Patch id="voice">` in the body — see below                                 |
| Previous / next              | the tree                                                                       |

`<Book>` still works inline in a lesson, for a citation a paragraph makes rather
than the page.

### "Open in Playground"

Only a lesson whose widget is the tutorial voice gets the link, and the page
works that out by scanning its own `.mdx` for `<Patch id="voice" …>`
(`learn/chrome/lesson-patches.ts`) rather than asking the lesson to declare its
patch a second time in frontmatter. The preset travels in the URL fragment, so
the Playground arrives sounding like the lesson did.

The format is `learn/playground/state.ts` — `#p=<base64url JSON>` of
`{ preset, params, xy, voices, glide }` — shared with the Playground itself,
which writes it back on every knob move. See "The Playground" below. `decodePlaygroundState`
never throws: a broken link opens a Playground at its defaults.

`/learn/playground` was the one entry in `scripts/check-learn-links.mjs`'s
`ALLOWLIST` until the route landed. The list is empty again, which is where it
should stay.

### A blocked lesson

`status: "blocked: <what it waits for>"` means the prose is written and the
module is not. The page renders the prose, a notice naming what it waits on, and
a placeholder where the widget would be — and it does that by handing MDX a
different `Patch`, from `app/learn/lesson-components.tsx`'s
`blockedLessonComponents(what)`. Neither the kit nor the lesson knows about
blocking: which component a tag resolves to is already the page's decision.

A blocked lesson still **writes a `<Patch id="…" />`**, and the id is the patch
that does not exist yet — `BlockedPatch` prints it, and it is the promise the
lesson is making. `check:sound` requires the placeholder (at least one
`[data-blocked-patch]` and no `figure[data-patch]`), so a blocked lesson with no
`<Patch>` fails it. Rule 3 knows this: it still fails a `<Patch>` with no id,
and it skips only "does the id resolve" when `status` starts with `blocked:`.
Write nothing else on the tag — a `show` list on a blocked `<Patch>` is neither
rendered nor checked. Quote the status: `status: "blocked: <what it waits for>"`
contains a `: `, so unquoted YAML will not parse.

### Progress

`learn/chrome/progress.ts` keeps the set of visited lesson urls in
`localStorage` under `learning-synthlet.visited`, and nothing else: no account,
no server, no analytics. Two rules hold everywhere it is used:

- **Nothing progress-related is in the export.** `useProgress().ready` is state
  set in an effect, so `CoreProgress` and `VisitedMark` render `null` on the
  server and on the first client render. A bar that shipped at 0% would flash
  empty on every load for a reader who is halfway through.
- **Every call is guarded.** `localStorage` throws in a private window.

`MarkVisited` is what makes a lesson visited, and the lesson page is the only
thing that renders it, so "visited" means "opened" in exactly one place.

### The keys

`LessonKeys` turns `←` and `→` into previous and next. It stands down for a
modifier key and for anything focusable — `input`, `textarea`, `select`,
`button`, `[contenteditable]`, `[role="application"]`, `[role="slider"]`,
`[role="switch"]`, `[tabindex]` — which is every control the kit renders,
including the XY pad, which nudges by 0.02 per arrow press of its own.

### The map figure

`learn/kit/MapFigure.tsx` is the one drawing in the section: Part 63's three
shelves — sources, modifiers, controllers — with two arrows saying that the
shelf is the patching and not the module. Inline SVG rather than a file under
`public/`, because an `<img>` cannot see the tokens and a figure that keeps its
colours through a theme swap is the one thing this section is built not to have.
Every colour in it is `currentColor` under a `learn-` class.

It lives in the **kit** rather than the chrome because it has two callers and
one of them is a lesson: `app/learn/index-page.tsx` draws it on the map and
`sound/sources-modifiers-controllers.mdx` writes `<Map />`. That decision was
04c's and it is made — the vocabulary is eight words and the eighth is this
drawing.

## The Playground

`/learn/playground` is the tutorial voice with nothing hidden: all thirty-one
parameters in the voice's own five groups, the voice count, the glide, the
sixteen-sound gallery, an XY pad, and a link you can send someone. It is what
every voice lesson's "Open in Playground" points at, and it is the section's
last playable page.

It is **a patch, rendered by the kit** (`learn/patches/playground.ts`), so it is
held to rule 2 and looks like every widget. What it is not is a `LessonWidget`:
a lesson shows two or three controls and one flat grid is right for that, and
thirty-five knobs in one grid is a preset list with the names taken off. The
frame is `learn/playground/PlaygroundRig.tsx`, and every control and view inside
it is drawn by the kit's own `renderControl` and `renderView`.

| File                                 | What                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `learn/patches/playground.ts`        | The synth: the thirty-one derived as `voice.ts` derives them, the pad, the pool |
| `learn/voice/mappings.ts`            | What the pad moves, per preset. Data, and one taper                             |
| `learn/playground/state.ts`          | The link format, shared with the lesson chrome                                  |
| `learn/playground/values.ts`         | A preset as thirty-one numbers, and the diff a link carries                     |
| `learn/playground/pad.ts`            | A mapping as a control the kit can render, and where its dot starts             |
| `learn/playground/Playground.tsx`    | The wrapper, which exists only to re-key the rig when the voice count changes   |
| `learn/playground/PlaygroundRig.tsx` | The frame: gallery, views, pad, the five groups, "Copy link", the code          |
| `app/learn/playground/page.tsx`      | The route. Deliberately not a page in `content/learn` — see the file's comment  |

### The link is the state

```
/learn/playground#p=<base64url JSON { preset, params, xy, voices, glide }>
```

`params` carries **only what differs from the preset**, `xy` only if the pad was
moved off the sound's own position, `voices` and `glide` only if they are not the
defaults — so a Playground nobody has touched has a clean URL and a Playground
with two knobs moved has a short one. Every change rewrites the fragment with
`history.replaceState`, which is why "Copy link" is `location.href` and there is
no second store to keep in step.

`decodePlaygroundState` never throws and clamps what it reads: a pad position to
0…1, the pool to 1…8, the glide to 0…1 s. A link is user input, and a
`voices: 400` in one is four hundred voices' worth of worklets from a string
somebody typed.

**The link is applied after `ready`**, in the rig's one seeding effect, by
writing all thirty-one parameters with `ref.value = x`. Not `setPreset`: a
scheduled value does not reach a `.value` read in the same tick, and a gallery
tile has to move thirty-one sliders now. `playground.test.ts` builds an
instrument with every preset in both banks and checks the page's own resolution
against the library's, because two resolvers that disagree would be a page whose
knobs lie about the sound.

### The pad

Each gallery preset names one or two parameters per axis in
`learn/voice/mappings.ts`; a preset with no mapping — every lesson preset — gets
cutoff across and resonance up. The patch's `padX`/`padY` are positions, 0…1, and
writing one sweeps everything bound to that axis with `setTargetAtTime` and a
10 ms constant, so a fast gesture across the whole cutoff range does not zipper.
The ramp is in the patch because only a patch has the context's clock;
`kit/controls/XY.tsx` knows where a finger is and coalesces its writes to one per
animation frame.

Loading a preset **places** the dot rather than sweeping to it
(`synth.placePad`): the thirty-one parameters are already the sound, and an axis
with two bindings has no position that satisfies both, so a sweep would undo half
of what was just written. The pad takes over the moment it is touched.

**To add a gallery preset**: add it to `galleryPresets` in `learn/voice/presets.ts`
and a mapping under the same key in `learn/voice/mappings.ts`. The tile and the
pad appear; `mappings.test.ts` fails if the two lists disagree or if a binding
asks for a value its parameter will not take.

### Voices rebuilds

The pool is built once and its size is fixed, so a different count is a different
instrument — `site/examples/InstrumentExample.tsx` has done it that way since the
module shipped. A patch cannot rebuild itself, so the `voices` accessor records
what was asked for and calls whoever is listening; the rig writes the fragment
and asks `Playground.tsx` to re-key it, and the rebuilt rig reads the sound back
out of the URL it just wrote. Play resumes with it.

## The rules

`learn/rules.test.ts`, run by `npm --prefix site test` and by CI (a step in the
`build` job of `.github/workflows/test.yml`).

| #   | What it checks                                                                                                                                                                                                                                                                               | Where                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | No `import`/`export` at line start, no `className`, no `style=`, and no tag outside the vocabulary. Code fences and inline code are stripped first, so prose _about_ an import is fine                                                                                                       | `content/learn/**/*.mdx`                                                          |
| 2   | No import of `react`, `react-dom`, `next`, or anything under `kit/` or `app/` (a `?raw` query is ignored); every patch on disk is registered; key, `id` and path agree; control ids are unique. A `*.test.ts` beside a patch is not a patch and is exempt                                    | `learn/patches/**/*.ts`                                                           |
| 3   | Every `<Patch id>` resolves in the registry and every name in `show` is one of that patch's controls. When the registry gains a `voice` id, every `preset` is checked against `learn/voice`'s two banks. A `blocked:` lesson's id is exempt from resolving — it names the module it waits on | content ↔ registry                                                                |
| 4   | No `#hex`, `rgb(`, `hsl(`, no Tailwind palette class (`bg-sky-500` and the other twenty-one palettes), no `fd-` class. `theme/*.css` are the token files and are exempt                                                                                                                      | `learn/kit`, `learn/chrome`, `learn/playground`, `learn/theme/*.tsx`, `app/learn` |
| 5   | Frontmatter passes `learn/frontmatter.ts`; every `book` part is 1–63; every lesson carries `core`, `book`, `hear` and `status`                                                                                                                                                               | `content/learn/**/*.mdx`                                                          |

Each violation names the file and the rule. They are collected rather than
thrown, so four mistakes are four lines and not four runs.

## Running the tests

```sh
npm --prefix site test              # rules + the tutorial voice
npm --prefix site run test:watch    # while writing
npm --prefix site test -- learn/rules.test.ts
```

`site/vitest.config.ts` includes `learn/**/*.test.ts(x)` and nothing else, and
runs in forked processes because the voice test loads a native audio addon. The
packages keep their own jest suite at the repository root; it excludes `/site/`,
so the two runners never see each other's files.

Also worth running before a commit:

```sh
npm --prefix site run check:links   # after a build: every /learn/ link resolves
npx tsc --noEmit -p site
npm run format:check                # at the repository root
```

`check:links` reads the export, not the prose, so it needs a build first
(`DEPLOY=true npm --prefix site run build`). CI runs both, in the `build` job.
A link to a page a later ticket builds goes in the script's `ALLOWLIST` with its
reason; a link to a page nobody is building is a dead link, not an allowlisted
one.
