"use client";

import { useEffect, useRef } from "react";
import {
  ClaveDrum,
  Compound,
  Gain,
  LevelMeterUI,
  LookaheadLimiter,
  type LookaheadLimiterWorkletNode,
} from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function LimiterSynth(ac: AudioContext) {
  // A percussive source is what makes a limiter audible: the transient is
  // where a peak limiter earns its lookahead.
  const drum = ClaveDrum(ac);
  // `meter: true` is the whole opt-in. It publishes the same contract
  // `@synthlet/level-meter` does, which is why `LevelMeterUI` below draws it
  // with no adapter.
  const limiter = LookaheadLimiter(ac, { threshold: -1, meter: true });
  const out = Gain(ac);

  drum.connect(limiter).connect(out);

  return Compound({
    output: out,
    owns: [drum, limiter],
    exposes: { limiter, trigger: drum.trigger },
  });
}

// The reading the demo was missing: until now it asked the listener to *hear* a
// ceiling hold, which is the one thing a limiter is supposed to make inaudible.
function GainReduction({ limiter }: { limiter: LookaheadLimiterWorkletNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const ui = new LevelMeterUI({ mode: "reduction", minDb: -20, maxDb: 0 });
    ui.attach(canvas.current, limiter);
    return () => ui.detach();
  }, [limiter]);

  return (
    <div>
      <div className="mb-1 text-xs opacity-60">
        Gain reduction (0 to −20 dB)
      </div>
      <canvas ref={canvas} className="h-8 w-full" />
    </div>
  );
}

function Example() {
  const synth = useSynth(LimiterSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {/* Drive first: pushing it is what demonstrates the ceiling holding. */}
        <Slider
          label="Drive"
          inputClassName="col-span-2"
          param={synth.limiter.gain}
          min={0}
          max={24}
          units=" dB"
        />
        <Slider
          label="Threshold"
          inputClassName="col-span-2"
          param={synth.limiter.threshold}
          min={-24}
          max={0}
          units=" dBTP"
        />
        <Slider
          label="Release"
          inputClassName="col-span-2"
          param={synth.limiter.release}
          min={10}
          max={1000}
          units=" ms"
        />
      </div>
      <GainReduction limiter={synth.limiter} />
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="LookaheadLimiter">
    <Example />
  </ExamplePane>
);
