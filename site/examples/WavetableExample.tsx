"use client";

import { synthlet } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Trigger } from "./components/Trigger";
import { useSynth } from "./useSynth";

export function WavetableExample() {
  const synth = useSynth(
    synthlet((op) => {
      const trigger = op.param();
      const freq = op.param(440);
      const table = op.wavetable("ACCESS_V");
      return op.synth(op.serial(op.wt(table, freq), op.vca(trigger)), {
        trigger,
        freq,
      });
    })
  );

  if (!synth) return null;

  return (
    <ExamplePane label="Wavetable">
      <div className="flex ">
        <Trigger trigger={synth.trigger} />
      </div>
    </ExamplePane>
  );
}
