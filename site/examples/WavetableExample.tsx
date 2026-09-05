"use client";

import { useEffect, useState } from "react";
import {
  AdsrAmp,
  builtInHarmonics,
  Compound,
  fetchWavetableNames,
  Gain,
  Lfo,
  LfoType,
  Param,
  WavetableOscillator,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

/** The table the oscillator generates for itself, and the initial selection. */
const BUILT_IN = "Built-in";

const WavetableSynth = (ac: AudioContext) => {
  const gate = Param(ac);
  const freq = Param(ac, { input: 440 });
  const volume = Param.db(ac, -24);

  // No `loadWavetable` here: the oscillator ships with a built-in sine ->
  // triangle -> sawtooth -> square table and is audible before anything is
  // fetched. Picking a name from the dropdown replaces it.
  //
  // `morph` is the wavetable position, 0 = first plane and 1 = last. It starts
  // centred so the LFO below has room either side of it.
  const osc = WavetableOscillator(ac, { frequency: freq, morph: 0.5 });
  const amp = AdsrAmp(ac, { gate });
  const out = Gain(ac, { gain: volume });

  // The oscillator used to carry its own morph phasor, as a `morphFrequency`
  // parameter. It does not any more: `morph` is a-rate, so an `Lfo` into it is
  // the same sound and can be any shape, any depth and any rate - which is what
  // this connection demonstrates. The slider sets the centre, the LFO swings
  // around it, and Web Audio clamps the sum into the parameter's 0..1.
  const lfo = Lfo(ac, { frequency: 0.2, type: LfoType.Triangle, gain: 0 });
  lfo.connect(osc.morph);

  osc.connect(amp).connect(out);

  return Compound({
    output: out,
    owns: [osc, amp, lfo, gate, freq, volume],
    exposes: {
      osc,
      lfo,
      gate: gate.input,
      freq: freq.input,
      volume: volume.input,
    },
  });
};

function WavetableExample() {
  const [currentWavetableName, setCurrentWavetableName] =
    useState<string>(BUILT_IN);
  const [availableNames, setAvailableNames] = useState<string[]>([]);

  useEffect(() => {
    fetchWavetableNames().then((names) => {
      names.sort();
      setAvailableNames(names);
    });
  }, []);
  const synth = useSynth(WavetableSynth);

  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <div className="text-right">Wavetable</div>
        <select
          className="col-span-2 bg-zinc-900 p-1 rounded border-zinc-300"
          value={currentWavetableName}
          onChange={(event) => {
            const name = event.target.value;
            setCurrentWavetableName(name);
            if (name === BUILT_IN) synth.osc.setHarmonics(builtInHarmonics());
            else synth.osc.loadWavetable(name);
          }}
        >
          <option key={BUILT_IN}>{BUILT_IN}</option>
          {availableNames.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <div></div>

        <Slider
          label="Morph"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={synth.osc.morph}
        />
        <Slider
          label="Morph LFO rate"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={20}
          units=" Hz"
          param={synth.lfo.frequency}
        />
        <Slider
          label="Morph LFO depth"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={0.5}
          param={synth.lfo.gain}
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
  <ExamplePane label="Wavetable">
    <WavetableExample />
  </ExamplePane>
);
