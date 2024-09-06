"use client";

import { AssignParams, Operators, PolyblepWaveformType } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function PolyblepSynth() {
  const { Param, Conn, Amp, Polyb } = Operators;
  const gate = Param();
  const type = Param.val(PolyblepWaveformType.SAWTOOTH);
  const frequency = Param.val(200);
  const volume = Param.db(-100);

  return AssignParams(
    Conn.serial(Polyb({ type, frequency }), Amp({ gain: volume })),
    {
      gate,
      type,
      frequency,
      volume,
    }
  );
}

function WavetableExample() {
  const synth = useSynth(PolyblepSynth());
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={3000}
          initial={220}
          units="Hz"
          onChange={(value) => {
            synth.frequency.setValueAtTime(value, 0);
          }}
        />

        <div className="flex col-span-4">
          <GateButton gate={synth.gate} />
        </div>
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
  <ExamplePane label="Polyblep oscillator">
    <WavetableExample />
  </ExamplePane>
);
