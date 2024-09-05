"use client";

import { Slider } from "@/examples/components/Slider";
import { useState } from "react";
import { synthlet } from "synthlet";
import { useSynth } from "./useSynth";

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
  const synth = useSynth(
    synthlet((op) => {
      const trigger = op.param();
      const release = op.param();
      const attack = op.param();
      return op.synth(
        op.serial(
          op.sine(op.ad(trigger, attack, release, { offset: 440, gain: 2000 })),
          op.amp(0.2)
        ),
        { trigger, release, attack }
      );
    })
  );

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
          initial={0.1}
          onChange={(value) => {
            synth.attack.value = value;
          }}
          initialize
        />
      </div>
      <div className="flex ">
        <Slider
          label="Release"
          labelClassName="w-20 text-right mr-2"
          min={0}
          max={1}
          step={0.001}
          initial={0.2}
          onChange={(value) => {
            synth.release.value = value;
          }}
          initialize
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
