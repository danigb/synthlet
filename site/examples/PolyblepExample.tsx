"use client";

import { PolyblepWaveformType, synthlet } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const gate = op.param();
  const type = op.param(PolyblepWaveformType.SAWTOOTH);
  const freq = op.param(200);
  const volume = op.param.db(-100);
  return op.synth(
    op.conn(op.pb(type, freq), op.amp.adsr(gate), op.amp(volume)),
    { gate, freq, volume }
  );
});

function WavetableExample() {
  const synth = useSynth(createSynth);
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
            synth.freq.setValueAtTime(value, 0);
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
