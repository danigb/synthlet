"use client";

import { useEffect, useState } from "react";
import { fetchWavetableNames, synthlet } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const gate = op.param();
  const freq = op.param(440);
  const table = op.wt.table("ACCESS_V");
  const volume = op.param.db(-24);
  const osc = op.wt(table, freq, { morphFrequency: 1 });
  const synth = op.synth(op.conn(osc, op.amp.adsr(gate), op.amp(volume)), {
    gate,
    freq,
    volume,
  });
  return Object.assign(synth, { osc, table });
});

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
  const synth = useSynth(createSynth);

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
            synth.table.load(event.target.value);
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
