"use client";

import { useState } from "react";
import { ClaveDrum, KickDrum, SnareDrum } from "synthlet";
import { CreateSynth, Synth, useSynth } from "./useSynth";

type DrumSynth = Synth & {
  trigger: AudioParam;
};

function getSynth(instrumentName: string) {
  switch (instrumentName) {
    case "KickDrum":
      return KickDrum;
    case "ClaveDrum":
      return ClaveDrum;
    case "SnareDrum":
      return SnareDrum;
    default:
      throw Error(`Unknown instrument: ${instrumentName}`);
  }
}

export function DrumExample<T extends DrumSynth>({
  instrumentName,
}: {
  instrumentName: string;
}) {
  const [open, setOpen] = useState(false);

  return open ? (
    <DrumExampleUI
      instrumentName={instrumentName}
      onClose={() => setOpen(false)}
      createSynth={getSynth(instrumentName)}
    />
  ) : (
    <button
      className="border px-2 py-1 rounded bg-fd-secondary"
      onClick={() => setOpen(true)}
    >
      Open example
    </button>
  );
}

function DrumExampleUI<T extends DrumSynth>({
  instrumentName,
  onClose,
  createSynth,
}: {
  instrumentName: string;
  onClose: () => void;
  createSynth: CreateSynth<T>;
}) {
  const [selectedNoiseType, setSelectedNoiseType] = useState(0);
  const [volume, setVolume] = useState(-60);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">{instrumentName} example</div>

      <div className="flex items-center gap-2 mb-4">
        <div>Tone:</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          onChange={(e) => {
            (synth as any).tone.value = e.target.valueAsNumber;
          }}
        />
      </div>
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
