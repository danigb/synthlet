"use client";

import { useState } from "react";
import {
  Gain,
  Lfo,
  LfoType,
  Oscillator,
  Param,
  ParamScaleType,
  VirtualAnalogFilter,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const creteSynth = (context: AudioContext) => {
  const osc = Oscillator(context, { type: "sawtooth", frequency: 5000 });
  const volume = Param(context, { scale: ParamScaleType.DbToGain, input: -12 });
  const lfo = Lfo(context, {
    frequency: 10,
    type: LfoType.RandSampleHold,
    gain: 0,
  });
  const filter = VirtualAnalogFilter(context, {
    frequency: 2000,
    detune: lfo,
  });
  const gain = Gain(context, { gain: volume });

  osc.connect(filter).connect(gain).connect(context.destination);

  return Object.assign(gain, { osc, filter, volume: volume.input, lfo });
};

function Example() {
  const [currentType, setCurrentType] = useState<number>(
    VirtualAnalogFilter.MOOG_LADDER
  );
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
        <option value={VirtualAnalogFilter.MOOG_LADDER}>Moog Ladder</option>
        <option value={VirtualAnalogFilter.MOOG_HALF_LADDER}>
          Moog Half Ladder
        </option>
        <option value={VirtualAnalogFilter.KORG35_LPF}>Korg35 Low Pass</option>
        <option value={VirtualAnalogFilter.KORG35_HPF}>Korg35 High Pass</option>
        <option value={VirtualAnalogFilter.DIODE_LADDER}>Diode Ladder</option>
        <option value={VirtualAnalogFilter.OBERHEIM_LPF}>
          Oberheim Low Pass
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_HPF}>
          Oberheim High Pass
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_BPF}>
          Oberheim Band Pass
        </option>
        <option value={VirtualAnalogFilter.OBERHEIM_BSF}>
          Oberheim Band Stop
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
