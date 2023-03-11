"use client";

import { useEffect, useState } from "react";
import { Mika, MikaPresets } from "synthlet";
import { getAudioContext } from "./audio-context";
import { ConnectMidi } from "./ConnectMidi";
import { PianoKeyboard } from "./PianoKeyboard";

const presetNames = MikaPresets.map((p) => p.name);

export function MikaExample({ className }: { className?: string }) {
  const [mika, setMika] = useState<Mika | undefined>(undefined);
  const [presetName, setPresetName] = useState(presetNames[0]);

  useEffect(() => {
    const mika = new Mika(getAudioContext());
    setMika(mika);
    return () => {
      mika.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl">Mika</h1>
        <p>A port of MikaMicro synth</p>
      </div>
      <div className="flex gap-2 mb-2">
        <ConnectMidi
          instrument={{
            start(note) {
              console.log("start", note);
              mika?.setNote(note.note, note.velocity);
              mika?.start();
            },
            stop(note) {
              console.log("stop", note);
              mika?.release();
            },
          }}
        />
      </div>
      <div className={!mika ? "opacity-30" : ""}>
        <div className="flex gap-4 mb-2 no-select">
          <select
            className="bg-zinc-700 rounded"
            value={presetName}
            onChange={(e) => {
              const presetName = e.target.value;
              const preset = MikaPresets.find((p) => p.name === presetName);
              if (preset) mika?.setPreset(preset);
              setPresetName(presetName);
            }}
          >
            {presetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            className="bg-zinc-700 rounded px-3 py-0.5 shadow"
            onClick={() => {
              //   piano?.stop();
            }}
          >
            Stop all
          </button>
        </div>
        <PianoKeyboard
          borderColor="border-rose-700"
          onPress={(note) => {
            if (!mika) return;
            mika.setNote(note.note, note.time);
            mika.start(note.time);
          }}
          onRelease={(midi) => {
            mika?.release();
          }}
        />
      </div>
    </div>
  );
}
