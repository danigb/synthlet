# Learning Synthlet — the three layers

The tutorial at `/learn` has to be redesignable later without editing a lesson.
That is not a preference; it is the architecture, and `rules.test.ts` is the
part of it that fails the build when someone forgets.

Three layers, three directories, one direction of dependency:

| Layer       | Where                                                          | May contain                                                                                                                                              | May not                                                                           |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Content** | `site/content/learn/**/*.mdx` and `site/learn/patches/**/*.ts` | Prose, the seven-word vocabulary below, and patches: synthlet code plus a manifest of controls and views                                                 | `import`, `className`, `style`, raw HTML, React — anything that says how it looks |
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

Plus markdown: headings, paragraphs, lists, emphasis, links, code fences.

A lesson that wants an eighth component is a conversation about whether the need
is content or design. The answer is usually a change in `kit/` with no new tag.

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
   (`{ "title": …, "pages": [ … ] }`) and add the folder name to
   `content/learn/meta.json`'s `pages`. Entries there naming folders that do not
   exist yet are silently dropped and the order is kept, so the whole
   table of contents can be listed before it is written.

No route file is touched: `app/learn/[...slug]/page.tsx` enumerates the
collection.

## How to add a patch

1. Write `learn/patches/<chapter>/<name>.ts`. It imports `synthlet` and
   `../define`, and nothing else. `export default definePatch({ … })` with
   `id: "<chapter>/<name>"` — **the id is the path**.

2. Add one line to `learn/patches/<chapter>/index.ts`:

   ```ts
   import name from "./name";
   export const <chapter>Patches = { "<chapter>/<name>": name };
   ```

3. If the chapter is new, add one line to `learn/patches/index.ts` spreading
   that chapter's object.

A file per chapter is why six people can add six chapters' patches at once
without meeting in the same file. The key, the `id` and the path are three
statements of one name, and rule 2 fails unless all three agree.

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
| `kit/CodeView.tsx`       | The `?raw` source, manifest folded                                                        |
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

| View       | Option                                    | What it does                                                                       |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `scope`    | `window: "wave" \| "contour"`, `seconds?` | `wave` is a few cycles; `contour` is a rolling peak history, which is an envelope  |
| `spectrum` | `marks: number[] \| (synth) => number[]`  | Frequencies ruled over the trace: the prediction beside the measurement, per frame |
| `spectrum` | `minDb`, `maxDb`                          | Written onto the analyser; they are its display range                              |
| `meter`    | `show: ("peak" \| "rms" \| "lufs")[]`     | Defaults to `["peak"]`. `lufs` turns on the `LevelMeter`'s loudness path           |
| `keyboard` | `octaves`, `from`                         | A view as well as a control, so a lesson's `show` cannot take the keys away        |
| `diagram`  | `compact`                                 | Renders nothing yet — ticket 07                                                    |

A patch may also set `code: { lines: [from, to] }` to open "View the code" on a
slice of its file rather than the whole of it.

### "View the code"

`next.config.mjs` pushes one webpack rule — `resourceQuery: /raw/`,
`type: "asset/source"` — so a chapter index can import its own patch twice:

```ts
import harmonics from "./harmonics";
import harmonicsSource from "./harmonics.ts?raw";
```

The registry keeps the second beside the first and `getPatchSource(id)` returns
it. There is no second copy of any patch anywhere, which is the point: editing
`sound/harmonics.ts` changes both what plays and what is shown.

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
- `Diagram`: `"auto"` — reserved for `graph()` — or `{ nodes, edges }`
- `resolveControls(patch, show)` filters by `show` in **manifest** order;
  `unknownControls(patch, show)` is what rule 3 reports

A control's `param` is any `{ value: number }`: an `AudioParam`, or a plain
accessor on the compound's `exposes` for something that is not one (a harmonic
count that rebuilds a table, a waveform index that has to reach two
oscillators). The kit never needs to know which it was handed.

## The rules

`learn/rules.test.ts`, run by `npm --prefix site test` and by CI (a step in the
`build` job of `.github/workflows/test.yml`).

| #   | What it checks                                                                                                                                                                                                                                            | Where                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | No `import`/`export` at line start, no `className`, no `style=`, and no tag outside the vocabulary. Code fences and inline code are stripped first, so prose _about_ an import is fine                                                                    | `content/learn/**/*.mdx`                      |
| 2   | No import of `react`, `react-dom`, `next`, or anything under `kit/` or `app/` (a `?raw` query is ignored); every patch on disk is registered; key, `id` and path agree; control ids are unique. A `*.test.ts` beside a patch is not a patch and is exempt | `learn/patches/**/*.ts`                       |
| 3   | Every `<Patch id>` resolves in the registry and every name in `show` is one of that patch's controls. When the registry gains a `voice` id, every `preset` is checked against `learn/voice`'s two banks                                                   | content ↔ registry                            |
| 4   | No `#hex`, `rgb(`, `hsl(`, no Tailwind palette class (`bg-sky-500` and the other twenty-one palettes), no `fd-` class. `theme/*.css` are the token files and are exempt                                                                                   | `learn/kit`, `learn/theme/*.tsx`, `app/learn` |
| 5   | Frontmatter passes `learn/frontmatter.ts`; every `book` part is 1–63; every lesson carries `core`, `book`, `hear` and `status`                                                                                                                            | `content/learn/**/*.mdx`                      |

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
