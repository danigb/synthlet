"use client";

import { useState } from "react";
import {
  Compound,
  Gain,
  Lfo,
  LfoType,
  Oscillator,
  Param,
  VirtualAnalogFilter,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const createSynth = (ac: AudioContext) => {
  // A 110 Hz sawtooth, not the 5 kHz one this demo used to have. A source that
  // high is what you end up choosing when you tune by ear against a filter
  // whose corner is really 30 Hz; with a cutoff that means Hz, what a filter
  // demo needs is a source with harmonics all the way up and a cutoff that
  // starts in the middle of them.
  const volume = Param.db(ac, -12);
  const osc = Oscillator(ac, { type: "sawtooth", frequency: 110 });
  const lfo = Lfo(ac, {
    frequency: 10,
    type: LfoType.RandSampleHold,
    gain: 0,
  });
  const filter = VirtualAnalogFilter(ac, {
    frequency: 800,
    resonance: 0.7,
    drive: 1,
    detune: lfo,
  });
  const out = Gain(ac, { gain: volume });

  osc.connect(filter).connect(out);

  return Compound({
    output: out,
    owns: [osc, filter, lfo, volume],
    exposes: {
      osc,
      filter,
      lfo,
      volume: volume.input,
    },
  });
};

function Example() {
  const [currentType, setCurrentType] = useState<number>(
    VirtualAnalogFilter.MOOG_LADDER,
  );
  const synth = useSynth(createSynth);

  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <div>Filter type</div>
      <select
        className="col-span-2"
        value={currentType}
        onChange={(e) => {
          setCurrentType(parseInt(e.target.value));
          synth.filter.type.value = parseInt(e.target.value);
        }}
      >
        <option value={VirtualAnalogFilter.MOOG_LADDER}>
          Moog Ladder — 4-pole, self-oscillates
        </option>
        <option value={VirtualAnalogFilter.MOOG_HALF_LADDER}>
          Moog Half Ladder — 2-pole, self-oscillates
        </option>
        <option value={VirtualAnalogFilter.KORG35_LPF}>
          Korg 35 Low Pass — linear
        </option>
        <option value={VirtualAnalogFilter.KORG35_HPF}>
          Korg 35 High Pass — linear
        </option>
        <option value={VirtualAnalogFilter.DIODE_LADDER}>
          Diode Ladder — 4-pole, saturates
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_LPF}>
          Oberheim SEM — low-pass tap
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_HPF}>
          Oberheim SEM — high-pass tap
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_BPF}>
          Oberheim SEM — band-pass tap
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_BSF}>
          Oberheim SEM — band-stop tap
        </option>
      </select>
      <div></div>
      <Slider
        label="Frequency"
        inputClassName="col-span-2"
        param={synth.filter.frequency}
        min={20}
        max={20000}
      />
      <Slider
        label="Resonance"
        inputClassName="col-span-2"
        param={synth.filter.resonance}
        min={0}
        max={1}
      />
      <Slider
        label="Drive"
        inputClassName="col-span-2"
        param={synth.filter.drive}
        min={0}
        max={20}
      />
      <Slider
        label="Modulation"
        inputClassName="col-span-2"
        param={synth.lfo.gain}
        min={-12}
        max={12}
      />
      <Slider
        label="Volume"
        inputClassName="col-span-2"
        param={synth.volume}
        min={-60}
        max={0}
      />
    </div>
  );
}

export default () => (
  <ExamplePane label="Virtual Analog Filter">
    <Example />
  </ExamplePane>
);
