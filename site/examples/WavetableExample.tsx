"use client";

import { useEffect, useState } from "react";
import {
  Amp,
  AssignParams,
  Conn,
  fetchWavetableNames,
  Param,
  WavetableOscillator,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const WavetableSynth = () => (context: AudioContext) => {
  const gate = Param();
  const freq = Param(440);
  const volume = Param.db(-24);
  const osc = WavetableOscillator({});
  osc(context).loadWavetable("ACCESS_V");
  const synth = AssignParams(
    Conn.serial(osc, Amp.adsr(gate), Amp.vol(volume)),
    { freq, volume, gate }
  );
  return Object.assign(synth(context), { osc: osc(context) });
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
  const synth = useSynth(WavetableSynth());

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
          initial={1}
          step={0.1}
          onChange={(value) => {
            synth.osc.morphFrequency.value = value;
          }}
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
          initial={-24}
          initialize
          units="dB"
          onChange={(value) => {
            synth.volume.value = value;
          }}
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
