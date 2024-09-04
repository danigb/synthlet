"use client";

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
    synthlet((op) => op.synth(op.serial(op.sine(100), op.amp(0.2))))
  );

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">AttackDecay generator example</div>
      <button
        className="border px-2 py-1 rounded bg-fd-secondary"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
