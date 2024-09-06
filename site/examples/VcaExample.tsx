"use client";

import { WithParams } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const VcaSynth = WithParams(
  (p) => ({ gate: p() }),
  (p, op) => op.Conn.serial(op.Noise.white(), op.Amp.adsr(p.gate, 0.5))
);

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
