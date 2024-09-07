"use client";

import { getSynthlet, PolyblepOscillatorType } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function PolyblepSynth(context: AudioContext) {
  const s = getSynthlet(context);
  const gate = s.param();
  const type = s.param(PolyblepOscillatorType.SAWTOOTH);
  const frequency = s.param(200);
  const volume = s.param.db(-100);

  return s.synth({
    out: s.conn.serial(
      s.polyblep({ type, frequency }),
      s.amp.adsr(gate),
      s.amp(volume)
    ),
    inputs: { gate, type, frequency, volume },
  });
}

function WavetableExample() {
  const synth = useSynth(PolyblepSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={3000}
          units="Hz"
          param={synth.frequency}
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
          param={synth.volume}
          units="dB"
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
