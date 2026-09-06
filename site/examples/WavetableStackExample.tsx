"use client";

import { useState } from "react";
import { AdsrAmp, Compound, Gain, Param, WavetableOscillator } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

/** Cents applied to each voice, scaled by the spread control. */
const SPREAD = [-1, 0, 1];

const StackSynth = (ac: AudioContext) => {
  const gate = Param(ac);
  const freq = Param(ac, { input: 220 });
  const volume = Param.db(ac, -30);

  // Three oscillators, one `Gain`, three detune values: that is a supersaw, and
  // it is why this package has no unison mode of its own.
  //
  // `phase: "random"` is the part that is not obvious. Every worklet starts its
  // read position at 0, so three instances built without it begin
  // phase-locked - and detuned oscillators only drift apart over the beat
  // period, which at seven cents is about a second. The first few hundred
  // milliseconds of every note would be a comb filter, which is exactly the part
  // of a supersaw anyone actually hears as the attack. It is a construction
  // option rather than an `AudioParam` because it is a one-time initial
  // condition; `"random"` draws once per instance.
  const voices = SPREAD.map(() =>
    WavetableOscillator(ac, {
      frequency: freq,
      morph: 0.66,
      phase: "random",
    }),
  );

  const mix = Gain(ac, { gain: 1 / voices.length });
  const amp = AdsrAmp(ac, { gate });
  const out = Gain(ac, { gain: volume });

  for (const voice of voices) voice.connect(mix);
  mix.connect(amp).connect(out);

  return Compound({
    output: out,
    owns: [...voices, mix, amp, gate, freq, volume],
    exposes: {
      voices,
      gate: gate.input,
      freq: freq.input,
      volume: volume.input,
    },
  });
};

function WavetableStackExample() {
  const synth = useSynth(StackSynth);
  const [spread, setSpread] = useState(7);

  if (!synth) return null;

  // One control writing three `detune` params, scaled -1 / 0 / +1. The `Slider`
  // takes anything with a `value`, so the fan-out is an accessor rather than a
  // second component.
  const spreadParam = {
    get value() {
      return spread;
    },
    set value(cents: number) {
      setSpread(cents);
      synth.voices.forEach((voice, i) => {
        voice.detune.value = cents * SPREAD[i];
      });
    },
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Frequency"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={55}
          max={880}
          units=" Hz"
          param={synth.freq}
        />
        <Slider
          label="Spread"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={50}
          units=" cents"
          param={spreadParam}
        />
      </div>
      <div className="flex mt-4">
        <GateButton gate={synth.gate} />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          units="dB"
          param={synth.volume}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Wavetable stack">
    <WavetableStackExample />
  </ExamplePane>
);
