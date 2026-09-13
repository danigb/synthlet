"use client";

import { useEffect, useRef } from "react";
import { dbToUnit, formatDb, LevelMeter } from "synthlet";
import type { MeterOptions, NodeRef } from "../../patches/define";
import { addLevelProbe, trackLive } from "../test-hooks";
import type { PatchRuntime } from "../useLessonPatch";

/** The bottom of the scale. Below −60 dBFS a widget is silent to a reader. */
const MIN_DB = -60;
const MAX_DB = 0;

type Mode = "peak" | "rms" | "lufs";

const MODE_LABELS: Record<Mode, string> = {
  peak: "Peak",
  rms: "RMS",
  lufs: "LUFS",
};

/*
 * Is it making a sound, and how much of one.
 *
 * `LevelMeter.tap(synth)` is the whole of it - a compound *is* its output node,
 * so the meter needs no context argument and no registration call, and it adds
 * an edge without taking anything away. That is the docs' `MasterMeter`, and
 * this is the same measurement with the tutorial's own face on it: bars drawn
 * from tokens rather than a canvas the theme cannot reach, and the two readings
 * the shipped meter offers beyond peak.
 *
 * `rms` is loudness the way a level meter means it; `lufs` is loudness the way
 * a broadcast standard means it, and it costs a flag on the tap, so it is off
 * unless a lesson asks. A patch that asks for neither gets one peak bar, which
 * is all most lessons need and all the header has room for.
 *
 * The numbers move sixty times a second and React does not: the loop writes
 * widths and text through refs, so a running meter re-renders nothing.
 */
export function MeterView({
  source,
  label,
  options,
  runtime,
}: {
  source?: NodeRef<any>;
  label?: string;
  options?: MeterOptions;
  runtime: PatchRuntime;
}) {
  const modes = (options?.show ?? ["peak"]) as Mode[];
  const wantsLoudness = modes.includes("lufs");

  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const readouts = useRef<(HTMLSpanElement | null)[]>([]);
  const synth = runtime.synth;

  useEffect(() => {
    if (!synth) return;
    const node = (source ? source(synth) : synth) as AudioNode;
    // `LevelMeter.tap` needs an output to tap, and a patch is free to point a
    // meter at something that is not a node at all - the check is the docs'
    // `MasterMeter`'s, and it is a check rather than a cast for the same reason.
    if (typeof AudioNode === "undefined" || !(node instanceof AudioNode))
      return;

    const meter = LevelMeter.tap(node, { loudness: wantsLoudness });
    const releaseLive = trackLive();
    const releaseProbe = addLevelProbe(() => meter.getLevels().peak(0));

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const levels = meter.getLevels();
      modes.forEach((mode, index) => {
        const db =
          mode === "peak"
            ? levels.peak(0)
            : mode === "rms"
              ? levels.rms(0)
              : levels.momentary;
        const bar = bars.current[index];
        if (bar) bar.style.width = `${dbToUnit(db, MIN_DB, MAX_DB) * 100}%`;
        const readout = readouts.current[index];
        if (readout) readout.textContent = formatDb(db);
      });
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      releaseProbe();
      releaseLive();
      meter.dispose();
    };
    // `modes` is a fresh array every render and its *contents* are the
    // manifest's, fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synth, source, wantsLoudness]);

  return (
    <div
      className="flex min-w-0 flex-col gap-1"
      role="group"
      aria-label={label ?? "Output level"}
    >
      {modes.map((mode, index) => (
        <div key={mode} className="flex items-center gap-2">
          <span className="w-8 shrink-0 font-learn-mono text-[10px] uppercase text-learn-ink-muted">
            {MODE_LABELS[mode]}
          </span>
          <span className="h-2 w-24 overflow-hidden rounded-learn border border-learn-border bg-learn-bg">
            <span
              className="block h-full w-0 bg-learn-audio"
              ref={(element) => {
                bars.current[index] = element;
              }}
            />
          </span>
          <span
            className="w-8 shrink-0 text-right font-learn-mono text-[10px] text-learn-ink-muted"
            ref={(element) => {
              readouts.current[index] = element;
            }}
          >
            −∞
          </span>
        </div>
      ))}
    </div>
  );
}
