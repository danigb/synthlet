import { Euclid } from "synthlet";

// Draws what the module is playing. `Euclid.pattern` is pure and needs no
// `AudioContext`, which is the whole reason this is possible - see the package
// README's "Named rhythms".
//
// One row per fan channel: channel `i` plays `rotation + i * spread`. Row a's
// *empty* cells are exactly what `.rests` plays, which is how that output keeps
// a place in the demo after the pane became a fan.
//
// It is the shipped export and not a reimplementation, so the drawing cannot
// disagree with the audio: `dsp.ts`'s `update()` rebuilds its array from this
// same expression, and `worklet.test.ts` renders the processor and reads the
// pattern back out of the samples to say so.
export function PatternView({
  steps,
  beats,
  rotation,
  spread,
  channels = 4,
}: {
  steps: number;
  beats: number;
  rotation: number;
  spread: number;
  /** How many fan channels to draw. 1 for a module used without `spread`. */
  channels?: number;
}) {
  // The sliders hand over floats on their way between integers, and so does an
  // `AudioParam`. The engine floors all four once per block; this floors them
  // once per render, for the same reason and to the same values.
  const n = Math.max(0, Math.floor(steps));
  const rows = Array.from({ length: channels }, (_, i) =>
    Euclid.pattern(
      n,
      Math.floor(beats),
      Math.floor(rotation) + i * Math.floor(spread),
    ),
  );

  return (
    <div className="flex flex-col gap-1 py-2">
      {rows.map((pattern, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-4 text-xs opacity-60">{"abcd"[i] ?? i + 1}</div>
          <div
            className="grid flex-grow gap-[2px]"
            // Not a tailwind class: `steps` runs to 100 and `grid-cols-N` only
            // exists for the handful of N tailwind was told about at build
            // time. `minmax(0, 1fr)` is what lets a hundred cells shrink rather
            // than overflow the pane.
            style={{
              gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`,
            }}
          >
            {pattern.map((hit, step) => (
              <div
                key={step}
                className={
                  "h-3 rounded-[2px] border " +
                  (hit
                    ? "bg-fd-primary border-fd-primary"
                    : "bg-fd-muted border-fd-border")
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
