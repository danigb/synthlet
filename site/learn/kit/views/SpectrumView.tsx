"use client";

import { Spectrum } from "@/components/audio/Spectrum";
import { useEffect } from "react";
import type { AnalyserRef, SpectrumOptions } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";

/**
 * What is in the sound, by frequency.
 *
 * The shared `Spectrum`, plus the tutorial's one addition: `marks`, a set of
 * frequencies ruled over the trace. A lesson about harmonics has a *prediction*
 * - the nth partial is at n times the fundamental - and the whole of the lesson
 * is seeing the prediction and the measurement in one picture. The manifest may
 * give a fixed array or a function of the synth, in which case it is read once
 * per frame, so the marks follow a knob that is being turned.
 *
 * `minDb`/`maxDb` are written onto the analyser rather than passed: the vertical
 * range of a spectrum *is* `analyser.minDecibels`/`maxDecibels`, the two are
 * display properties with no effect on the audio, and the patch that declared
 * the option owns the node.
 */
export function SpectrumView({
  source,
  label,
  options,
  runtime,
  color,
  markColor,
}: {
  source: AnalyserRef<any>;
  label?: string;
  options?: SpectrumOptions<any>;
  runtime: PatchRuntime;
  color: string;
  markColor: string;
}) {
  const synth = runtime.synth;
  const analyser = synth ? source(synth) : null;
  const { minDb, maxDb, marks } = options ?? {};

  useEffect(() => {
    if (!analyser) return;
    if (minDb !== undefined) analyser.minDecibels = minDb;
    if (maxDb !== undefined) analyser.maxDecibels = maxDb;
  }, [analyser, minDb, maxDb]);

  const read = marks
    ? () => (typeof marks === "function" ? (synth ? marks(synth) : []) : marks)
    : undefined;

  return (
    <Spectrum
      analyser={analyser}
      label={label ?? "Spectrum"}
      color={color}
      className="min-w-0"
      canvasClassName="w-full rounded-learn border border-learn-border"
      marks={read}
      markColor={markColor}
    />
  );
}
