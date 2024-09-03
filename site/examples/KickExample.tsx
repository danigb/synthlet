"use client";

import { useState } from "react";
import { Kick } from "synthlet";
import { useSynth } from "./useSynth";

export function KickExample() {
  const [open, setOpen] = useState(false);

  return open ? (
    <NoiseSynthUI onClose={() => setOpen(false)} />
  ) : (
    <button
      className="border px-2 py-1 rounded bg-fd-secondary"
      onClick={() => setOpen(true)}
    >
      Start Kick example
    </button>
  );
}

function NoiseSynthUI({ onClose }: { onClose: () => void }) {
  const [selectedNoiseType, setSelectedNoiseType] = useState(0);
  const [volume, setVolume] = useState(-60);
  const synth = useSynth(Kick);
  if (!synth) return null;

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">Kick example</div>

      <div className="flex items-center gap-2 mb-4">
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
