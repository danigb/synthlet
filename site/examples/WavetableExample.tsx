"use client";

import { useEffect, useState } from "react";
import {
  AdsrAmp,
  disposable,
  fetchWavetableNames,
  Gain,
  Param,
  WavetableOscillator,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const WavetableSynth = (ac: AudioContext) => {
  const gate = Param(ac);
  const freq = Param(ac, { input: 440 });
  const volume = Param.db(ac, -24);

  const osc = WavetableOscillator(ac, { frequency: freq });
  osc.loadWavetable("ACCESS_V");
  const amp = AdsrAmp(ac, { gate });
  const out = Gain(ac, { gain: volume });

  osc.connect(amp).connect(out);

  return Object.assign(disposable(out, [osc, amp, gate, freq, volume]), {
    osc,
    gate: gate.input,
    freq: freq.input,
    volume: volume.input,
  });
};

function WavetableExample() {
  const [currentWavetableName, setCurrentWavetableName] =
    useState<string>("ACCESS_V");
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
            setCurrentWavetableName(event.target.value);
            synth.osc.loadWavetable(event.target.value);
          }}
        >
          {availableNames.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <div></div>

        <Slider
          label="Morph freq"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={10}
          step={0.1}
          param={synth.osc.morphFrequency}
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
