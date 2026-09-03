"use client";

import { Compound, Gain, Lfo, Param, PolyblepOscillator } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { SelectorParam } from "./components/Selector";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function PolyblepSynth(ac: AudioContext) {
  const volume = Param.db(ac, -24);

  const lfo = Lfo(ac, { frequency: 1, gain: 0 });
  const osc = PolyblepOscillator(ac, { frequency: 440, detune: lfo });
  const out = Gain(ac, { gain: volume });

  osc.connect(out);

  return Compound({
    output: out,
    owns: [osc, lfo, volume],
    exposes: {
      osc,
      lfo,
      volume: volume.input,
    },
  });
}

function Example() {
  const synth = useSynth(PolyblepSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <SelectorParam
          name="Waveform"
          inputClassName="col-span-2"
          param={synth.osc.type}
          valueNames={["Sine", "Triangle", "Saw", "Square"]}
        />

        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={3000}
          units="Hz"
          param={synth.osc.frequency}
        />

        <Slider
          label="Modulation"
          inputClassName="col-span-2"
          min={0}
          max={1000}
          param={synth.lfo.gain}
        />

        <Slider
          label="Width"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={synth.osc.width}
        />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          param={synth.volume}
          units="dB"
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Polyblep oscillator">
    <Example />
  </ExamplePane>
);
