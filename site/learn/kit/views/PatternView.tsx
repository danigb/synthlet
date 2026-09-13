"use client";

import { PatternView as Pattern } from "@/components/audio/PatternView";
import { useEffect, useState } from "react";
import type { PatternState } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { ViewFrame } from "./ViewFrame";

/**
 * What a rhythm module is playing, as a grid.
 *
 * The drawing is the docs examples', shared rather than copied, and it is the
 * shipped `Euclid.pattern` that fills it - so the picture cannot disagree with
 * the audio, because both come from the same pure function. All this adds is
 * where the numbers come from.
 *
 * They are polled, not subscribed to: the state behind a pattern is four
 * `AudioParam`s, which change without telling anyone, so a view that only
 * redrew on render would be right until the first time a slider moved. Polling
 * and comparing is four numbers a frame and re-renders only when one of them
 * actually changed.
 */
export function PatternView({
  source,
  label,
  runtime,
}: {
  source: (synth: any) => PatternState;
  label?: string;
  runtime: PatchRuntime;
}) {
  const synth = runtime.synth;
  const [state, setState] = useState<PatternState | undefined>(undefined);

  useEffect(() => {
    if (!synth) return;
    let frame = 0;
    const poll = () => {
      frame = requestAnimationFrame(poll);
      const next = source(synth);
      setState((previous) =>
        previous &&
        previous.steps === next.steps &&
        previous.beats === next.beats &&
        previous.rotation === next.rotation &&
        previous.spread === next.spread &&
        previous.channels === next.channels
          ? previous
          : next,
      );
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [synth, source]);

  if (!state) return null;

  return (
    <ViewFrame label={label ?? "Pattern"}>
      <Pattern
        steps={state.steps}
        beats={state.beats}
        rotation={state.rotation}
        spread={state.spread ?? 0}
        channels={state.channels ?? 1}
      />
    </ViewFrame>
  );
}
