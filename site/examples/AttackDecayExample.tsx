"use client";

import { Slider } from "@/examples/components/Slider";
import { useState } from "react";
import { AdEnv, Compound, Gain, Oscillator, Param } from "synthlet";
import { useSynth } from "./useSynth";

const AttackDecaySynth = (ac: AudioContext) => {
  const trigger = Param(ac);
  const decay = Param(ac);
  const attack = Param(ac);

  // The envelope is the oscillator's frequency: 440 Hz at rest, 2440 at peak.
  const pitchEnv = AdEnv(ac, {
    trigger,
    attack,
    decay,
    offset: 440,
    gain: 2000,
  });
  const osc = Oscillator(ac, { type: "sine", frequency: pitchEnv });
  const out = Gain(ac, { gain: 0.2 });

  osc.connect(out);

  return Compound({
    output: out,
    owns: [osc, pitchEnv, trigger, attack, decay],
    exposes: {
      trigger: trigger.input,
      attack: attack.input,
      decay: decay.input,
    },
  });
};

export function AttackDecayExample() {
  const [open, setOpen] = useState(false);

  return open ? (
    <AttackDecayUI onClose={() => setOpen(false)} />
  ) : (
    <button
      className="border px-2 py-1 rounded bg-fd-secondary"
      onClick={() => setOpen(true)}
    >
      Open example
    </button>
  );
}

function AttackDecayUI({ onClose }: { onClose: () => void }) {
  const synth = useSynth(AttackDecaySynth);

  if (!synth) return null;

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">AttackDecay generator example</div>
      <div className="flex ">
        <Slider
          label="Attack"
          labelClassName="w-20 text-right mr-2"
          min={0}
          max={1}
          step={0.001}
          param={synth.attack}
        />
      </div>
      <div className="flex ">
        <Slider
          label="Decay"
          labelClassName="w-20 text-right mr-2"
          min={0}
          max={1}
          step={0.001}
          param={synth.decay}
        />
      </div>
      <div className="flex mb-4">
        <button
          className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground"
          onMouseDown={() => {
            synth.trigger.value = 1;
          }}
          onMouseUp={() => {
            synth.trigger.value = 0;
          }}
        >
          Trigger
        </button>
      </div>
      <button
        className="border px-2 py-1 rounded bg-fd-secondary"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
