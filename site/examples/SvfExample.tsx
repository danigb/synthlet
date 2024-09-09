"use client";

import { useState } from "react";
import {
  Gain,
  Lfo,
  LfoType,
  Oscillator,
  Param,
  ParamScaleType,
  Svf,
  SvfType,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const creteSynth = (context: AudioContext) => {
  const osc = Oscillator(context, { type: "sawtooth", frequency: 1000 });
  const filter = Svf(context, { type: SvfType.LowPass, frequency: 1000, Q: 1 });
  const volume = Param(context, { scale: ParamScaleType.DbToGain, input: -12 });
  const lfo = Lfo(context, {
    frequency: 2,
    type: LfoType.RampUp,
    gain: 0,
  });
  const gain = Gain(context, { gain: volume });

  osc.connect(filter).connect(gain);
  lfo.connect(filter.frequency);

  return Object.assign(gain, { osc, filter, volume: volume.input, lfo });
};

function Example() {
  const [currentType, setCurrentType] = useState(SvfType.LowPass);
  const synth = useSynth(creteSynth);

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
        <option value={SvfType.ByPass}>None</option>
        <option value={SvfType.LowPass}>Low pass</option>
        <option value={SvfType.HighPass}>High pass</option>
        <option value={SvfType.BandPass}>Band pass</option>
        <option value={SvfType.Notch}>Notch</option>
        <option value={SvfType.Peak}>Peak</option>
        <option value={SvfType.AllPass}>All pass</option>
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
        label="Q"
        inputClassName="col-span-2"
        param={synth.filter.Q}
        min={0}
        max={40}
      />
      <Slider
        label="Modulation"
        inputClassName="col-span-2"
        param={synth.lfo.gain}
        min={0}
        max={1000}
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
  <ExamplePane label="Svf">
    <Example />
  </ExamplePane>
);
