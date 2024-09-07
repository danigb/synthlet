"use client";

import { getSynthlet } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const VcaSynth = (context: AudioContext) => {
  const s = getSynthlet(context);
  const gate = s.param();

  return s.withParams(s.conn.serial(s.noise.white(), s.amp.adsr(gate)), {
    gate,
  });
};

function WavetableExample() {
  const synth = useSynth(VcaSynth);
  if (!synth) return null;

  return (
    <div className="flex ">
      <GateButton gate={synth.gate} />
    </div>
  );
}

export default () => (
  <ExamplePane label="VCA">
    <WavetableExample />
  </ExamplePane>
);
