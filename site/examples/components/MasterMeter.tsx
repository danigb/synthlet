"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { LevelMeter, LevelMeterUI } from "synthlet";
import type { SynthSlot } from "./SynthSlot";

/**
 * The output level of whatever the pane is running.
 *
 * `LevelMeter.tap(synth)` is the whole of it: a synthlet compound *is* its
 * output node, so the meter needs no context argument, no registration call and
 * no `await`. It adds a second edge and takes nothing away, so the example
 * sounds exactly as it did without it.
 *
 * This is also a permanent soak test. Every docs page with an example runs a
 * `numberOfOutputs: 0` worklet node in every visitor's browser, which is the
 * assumption the pass-through form rests on - measured in Chrome, unverified in
 * Firefox and Safari.
 */
export function MasterMeter({ slot }: { slot: SynthSlot }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const synth = useSyncExternalStore(slot.subscribe, slot.get, () => null);

  useEffect(() => {
    const element = canvas.current;
    // Every example's synth is a `Compound`, which is an `AudioNode`; the
    // `Synth` type only promises `connect` and `dispose`, so this is checked
    // rather than cast.
    if (!element || !synth || !(synth instanceof AudioNode)) return;

    const meter = LevelMeter.tap(synth);
    const ui = new LevelMeterUI({
      minDb: -60,
      maxDb: 0,
      scale: false,
      gap: 1,
    });
    ui.attach(element, meter);

    return () => {
      ui.detach();
      meter.dispose();
    };
  }, [synth]);

  return (
    <canvas
      ref={canvas}
      aria-label="Output level"
      title="Output level"
      className="mr-2 h-6 w-32 self-start"
    />
  );
}
