"use client";

import { Slider } from "@/examples/components/Slider";
import { useState } from "react";
import { ClaveDrum, KickDrum, SnareDrum } from "synthlet";
import { CreateSynth, Synth, useSynth } from "./useSynth";

type DrumSynth = Synth & {
  trigger: AudioParam;
  volume: AudioParam;
  tone: AudioParam;
  decay: AudioParam;
  dispose(): void;
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
      createSynth={getSynth(instrumentName)()}
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
  createSynth: CreateSynth<DrumSynth>;
}) {
  const [selectedNoiseType, setSelectedNoiseType] = useState(0);
  const [volume, setVolume] = useState(-60);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">{instrumentName} example</div>

      <div className="flex items-center gap-2">
        <Slider
          label="Tone"
          labelClassName="w-20 text-right mr-2"
          onChange={(value) => {
            synth.tone.value = value;
          }}
        />
      </div>
      <div className="flex gap-2">
        <Slider
          label="Decay"
          labelClassName="w-20 text-right mr-2"
          initial={0.4}
          initialize
          units="s"
          onChange={(value) => {
            synth.decay.value = value;
          }}
        />
      </div>
      <div className="flex items-center gap-2 my-4">
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
