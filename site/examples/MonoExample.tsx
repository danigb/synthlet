"use client";

import React from "react";
import {
  Adsr,
  Amp,
  AssignParams,
  Conn,
  Lfo,
  LfoType,
  Param,
  PolyblepOscillator,
  StateVariableFilter,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

function FlyMonoSynth() {
  const gate = Param();
  const frequency = Param(400);
  const vibrato = Param(1);
  const lfo = Lfo({
    type: LfoType.Sine,
    offset: frequency,
    gain: vibrato,
    frequency: 1,
  });
  const osc = PolyblepOscillator({ frequency: lfo });
  const filterEnv = Adsr({ gate, gain: 3000, offset: 2000 });
  const filter = StateVariableFilter({ frequency: filterEnv });
  const amp = Amp.adsr(gate);

  const out = Conn.serial(osc, filter, amp);

  const synth = AssignParams(out, { gate, frequency, vibrato });

  return (context: AudioContext) => {
    const node = synth(context);
    // const modules = invokeAllFunctions(context, {
    //   lfo,
    //   osc,
    //   filter,
    //   filterEnv,
    // });
    return Object.assign(node, {});
  };
}

function invokeAllFunctions<
  T extends Record<string, (context: AudioContext) => any>
>(
  context: AudioContext,
  obj: T
): {
  [K in keyof T]: ReturnType<T[K]>;
} {
  const result = {} as { [K in keyof T]: ReturnType<T[K]> };

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key](context); // Call each function and store the result
    }
  }

  return result;
}

function Example() {
  const synth = useSynth(FlyMonoSynth());

  if (!synth) return null;

  return (
    <div>
      <GateButton gate={synth.gate} />
    </div>
  );
}

export default () => (
  <ExamplePane label="Fly Mono Synth">
    <Example />
  </ExamplePane>
);
