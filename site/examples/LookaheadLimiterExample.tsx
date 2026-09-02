"use client";

import { ClaveDrum, Compound, Gain, LookaheadLimiter } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function LimiterSynth(ac: AudioContext) {
  // A percussive source is what makes a limiter audible: the transient is
  // where a peak limiter earns its lookahead.
  const drum = ClaveDrum(ac);
  const limiter = LookaheadLimiter(ac, { threshold: -1 });
  const out = Gain(ac);

  drum.connect(limiter).connect(out);

  return Compound({
    output: out,
    owns: [drum, limiter],
    exposes: { limiter, trigger: drum.trigger },
  });
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
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="LookaheadLimiter">
    <Example />
  </ExamplePane>
);
