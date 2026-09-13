"use client";

import { GALLERY_PRESET_NAMES } from "@/learn/voice";

/*
 * The gallery.
 *
 * Sixteen sounds, as tiles, which is the shape Ableton's Playground uses and
 * the shape a preset list has had since the Prophet-5: a wall of names you press
 * rather than a menu you open. The lesson bank is deliberately not here - those
 * are twenty starting points for twenty lessons, not twenty sounds - but a link
 * may still name one, so the label says which sound is loaded whether or not it
 * has a tile.
 *
 * A tile applies the preset *and* its pad mapping, because the two are one
 * choice: the pad is what makes a preset something you play rather than
 * something you loaded.
 */

/** `wow-bass` on a tile is "Wow bass". The name in the link stays the slug. */
function title(name: string): string {
  const words = name.replace(/-/g, " ");
  return words[0].toUpperCase() + words.slice(1);
}

export function Gallery({
  chosen,
  onChoose,
}: {
  chosen?: string;
  onChoose: (preset: string | undefined) => void;
}) {
  const known = GALLERY_PRESET_NAMES.includes(chosen ?? "");

  return (
    <section aria-label="Presets" className="font-learn-text">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-learn-ink-muted">
          The gallery
        </h2>
        {chosen && !known ? (
          // A link from a lesson brings a lesson preset, which has no tile.
          <span className="font-learn-mono text-xs text-learn-ink-muted">
            loaded: {chosen}
          </span>
        ) : null}
      </div>

      <div className="mt-learn flex flex-wrap gap-2">
        <Tile
          name="Init"
          chosen={chosen === undefined}
          onChoose={() => onChoose(undefined)}
        />
        {GALLERY_PRESET_NAMES.map((name) => (
          <Tile
            key={name}
            name={title(name)}
            preset={name}
            chosen={chosen === name}
            onChoose={() => onChoose(name)}
          />
        ))}
      </div>
    </section>
  );
}

function Tile({
  name,
  preset,
  chosen,
  onChoose,
}: {
  name: string;
  preset?: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      data-preset={preset ?? "init"}
      aria-pressed={chosen}
      className={
        "rounded-learn border px-3 py-1 text-sm " +
        (chosen
          ? "border-learn-accent bg-learn-accent text-learn-bg"
          : "border-learn-border bg-learn-surface text-learn-ink hover:border-learn-accent")
      }
      onClick={onChoose}
    >
      {name}
    </button>
  );
}
