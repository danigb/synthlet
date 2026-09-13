/*
 * The one figure in the section drawn by hand.
 *
 * Synth Secrets' closing idea (Part 63) is that a synthesiser has three kinds
 * of module - sources, modifiers and controllers - and that which kind a module
 * *is* depends on what it is patched into, not on what it is. An oscillator
 * slowed to 5 Hz and pointed at a filter's cutoff is a controller; an LFO sped
 * to 500 Hz and sent to the output is a source. That is the whole catalogue in
 * one picture, and it is why this drawing opens the section and lesson 1.5
 * explains it.
 *
 * Inline SVG rather than a file under `public/`: an `<img>` cannot see the
 * tutorial's tokens, and a figure that keeps its colours while everything
 * around it changes theme is the one thing this section is built not to have.
 * Every colour below is `currentColor` under a `learn-` class, so the figure
 * restyles with the rest and `rules.test.ts` rule 4 reads it like any other
 * file in the kit.
 *
 * It lives in the kit rather than the chrome because it has two callers and one
 * of them is a lesson: `app/learn/index-page.tsx` draws it on the map, and
 * lesson 1.5 writes `<Map />`, which is the eighth word of the vocabulary. A
 * lesson may not import a component, and a static copy under `public/` would
 * keep its colours through a theme swap - so the drawing became a word. That
 * was `thoughts/tickets/learning-synthlet/04c-...`'s decision, option 1.
 */

interface Shelf {
  name: string;
  /** Four modules per shelf: enough to be the catalogue, few enough to read. */
  modules: string[];
  /** Reid draws audio in blue and control in black (Part 41). */
  tone: string;
  y: number;
}

const SHELVES: Shelf[] = [
  {
    name: "Sources",
    modules: ["Oscillator", "Wavetable", "Noise", "Karplus–Strong"],
    tone: "text-learn-audio",
    y: 24,
  },
  {
    name: "Modifiers",
    modules: ["Filter", "VCA", "Clip", "Delay"],
    tone: "text-learn-audio",
    y: 148,
  },
  {
    name: "Controllers",
    modules: ["Envelope", "LFO", "Param", "Clock"],
    tone: "text-learn-control",
    y: 272,
  },
];

const SHELF_X = 40;
const SHELF_WIDTH = 560;
const SHELF_HEIGHT = 84;
const CHIP_X = 56;
const CHIP_WIDTH = 124;
const CHIP_STEP = 134;
const CHIP_HEIGHT = 32;

function Shelf({ shelf }: { shelf: Shelf }) {
  return (
    <g>
      <g className="text-learn-surface">
        <rect
          x={SHELF_X}
          y={shelf.y}
          width={SHELF_WIDTH}
          height={SHELF_HEIGHT}
          rx={8}
          fill="currentColor"
        />
      </g>
      <g className="text-learn-border">
        <rect
          x={SHELF_X}
          y={shelf.y}
          width={SHELF_WIDTH}
          height={SHELF_HEIGHT}
          rx={8}
          fill="none"
          stroke="currentColor"
        />
      </g>

      <g className={shelf.tone}>
        <text
          x={CHIP_X}
          y={shelf.y + 24}
          fill="currentColor"
          fontSize={14}
          fontWeight={600}
        >
          {shelf.name}
        </text>
      </g>

      {shelf.modules.map((module, at) => (
        <g key={module}>
          <g className="text-learn-bg">
            <rect
              x={CHIP_X + at * CHIP_STEP}
              y={shelf.y + 38}
              width={CHIP_WIDTH}
              height={CHIP_HEIGHT}
              rx={6}
              fill="currentColor"
            />
          </g>
          <g className="text-learn-border">
            <rect
              x={CHIP_X + at * CHIP_STEP}
              y={shelf.y + 38}
              width={CHIP_WIDTH}
              height={CHIP_HEIGHT}
              rx={6}
              fill="none"
              stroke="currentColor"
            />
          </g>
          <g className="text-learn-ink">
            <text
              x={CHIP_X + at * CHIP_STEP + CHIP_WIDTH / 2}
              y={shelf.y + 59}
              fill="currentColor"
              fontSize={13}
              textAnchor="middle"
            >
              {module}
            </text>
          </g>
        </g>
      ))}
    </g>
  );
}

/**
 * The three shelves, and the two arrows that say the shelves are not fixed.
 *
 * The arrows run down the outside of the panels rather than across them: the
 * point is that a module *moves*, and a line through the middle of the
 * modifiers would read as a signal path, which is the one thing it is not.
 */
export function MapFigure() {
  return (
    <figure className="my-8 max-w-learn">
      <svg
        viewBox="0 0 640 360"
        role="img"
        aria-labelledby="map-of-the-shelves-title map-of-the-shelves-desc"
        className="h-auto w-full font-learn-text"
      >
        <title id="map-of-the-shelves-title">
          Sources, modifiers and controllers
        </title>
        <desc id="map-of-the-shelves-desc">
          Three shelves. Sources holds the oscillator, the wavetable, noise and
          Karplus–Strong. Modifiers holds the filter, the VCA, the clipper and
          the delay. Controllers holds the envelope, the LFO, Param and the
          clock. Two arrows run between the top shelf and the bottom one: an
          oscillator slowed to five hertz becomes a controller, and an LFO sped
          to five hundred hertz becomes a source.
        </desc>

        {SHELVES.map((shelf) => (
          <Shelf key={shelf.name} shelf={shelf} />
        ))}

        <g className="text-learn-accent">
          {/* Sources down to Controllers: an oscillator, slowed. */}
          <path
            d="M 28 104 C 6 160 6 226 26 288"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <path d="M 26 296 L 20 282 L 33 281 Z" fill="currentColor" />
          <text x={44} y={136} fill="currentColor" fontSize={11}>
            slow it to 5 Hz
          </text>

          {/* Controllers up to Sources: an LFO, sped. */}
          <path
            d="M 612 288 C 634 226 634 160 614 104"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <path d="M 614 96 L 620 110 L 607 111 Z" fill="currentColor" />
          <text
            x={596}
            y={252}
            fill="currentColor"
            fontSize={11}
            textAnchor="end"
          >
            speed it to 500 Hz
          </text>
        </g>
      </svg>

      <figcaption className="mt-2 font-learn-text text-sm text-learn-ink-muted">
        Every module is a source, a modifier or a controller — and which one it
        is depends on what it is patched into, not on what it is called.
      </figcaption>
    </figure>
  );
}
