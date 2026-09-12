"use client";

import { useState } from "react";
import {
  Clock,
  Compound,
  Gain,
  Noise,
  NoiseType,
  Oscillator,
  Param,
  SampleHold,
  SampleHoldType,
  Svf,
  SvfType,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

// Part 16, Figure 6: noise -> S&H -> filter cutoff. Reid: "this combination of
// clock, S&H and noise is so deeply routed in synthesis that some synthesizers
// combine them in a single module." It is four nodes, and it is the ELP burble.
//
// The clock's **gate** drives the trigger, not the `Clock` node itself: the
// node is a phase ramp, which is positive from the first beat onward and never
// falls back, so it would sample once and latch forever.
function createSynth(ac: AudioContext) {
  const bpm = Param(ac, { input: 480 });
  const depth = Param(ac, { input: 1600 });
  const volume = Param.db(ac, -14);

  const clock = Clock(ac, { bpm });
  const noise = Noise(ac, { type: NoiseType.White });
  const sampleHold = SampleHold(ac, { trigger: clock.gate });
  const cutoff = Gain(ac, { gain: depth });

  const osc = Oscillator(ac, { type: "sawtooth", frequency: 110 });
  // The held value is bipolar, so the cutoff sits above the depth: 2000 Hz
  // +/- 1600 keeps the sweep inside 400...3600 rather than against the floor.
  const filter = Svf(ac, { type: SvfType.LowPass, frequency: 2000, Q: 8 });
  const out = Gain(ac, { gain: volume });

  noise.connect(sampleHold).connect(cutoff).connect(filter.frequency);
  osc.connect(filter).connect(out);

  return Compound({
    output: out,
    owns: [clock, noise, sampleHold, cutoff, osc, filter, bpm, depth, volume],
    exposes: {
      sampleHold,
      bpm: bpm.input,
      depth: depth.input,
      volume: volume.input,
    },
  });
}

function Example() {
  const [type, setType] = useState(SampleHoldType.SampleHold);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <div>Mode</div>
      <select
        className="col-span-3"
        value={type}
        onChange={(e) => {
          const next = parseInt(e.target.value);
          setType(next);
          synth.sampleHold.type.value = next;
        }}
      >
        <option value={SampleHoldType.SampleHold}>Sample &amp; hold</option>
        <option value={SampleHoldType.Track}>Track &amp; hold</option>
      </select>
      <Slider
        label="Rate"
        inputClassName="col-span-2"
        min={30}
        max={1800}
        param={synth.bpm}
        units="bpm"
      />
      <Slider
        label="Depth"
        inputClassName="col-span-2"
        min={0}
        max={1900}
        param={synth.depth}
        units="Hz"
      />
      <Slider
        label="Volume"
        inputClassName="col-span-2"
        min={-60}
        max={0}
        param={synth.volume}
        units="dB"
      />
    </div>
  );
}

export default () => (
  <ExamplePane label="Sample and hold">
    <Example />
  </ExamplePane>
);
