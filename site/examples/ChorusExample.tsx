"use client";

import { AdsrAmp, Oscillator, Param } from "synthlet";
import { Chorus } from "../../packages/chorus/src";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

function ChorusSynth(context: AudioContext) {
  const gate = Param(context, { input: 0.1 });
  const osc = Oscillator(context, { frequency: 440 });
  const amp = AdsrAmp(context, { gate });
  const chorus = Chorus(context, {});

  osc.connect(amp).connect(chorus);

  return Object.assign(chorus, { osc, amp, gate, chorus });
}

function Example() {
  const synth = useSynth(ChorusSynth);
  if (!synth) return null;

  return (
    <>
      <GateButton gate={synth.gate.input} />
    </>
  );
}

export default () => (
  <ExamplePane label="Chorus">
    <Example />
  </ExamplePane>
);
