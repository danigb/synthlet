"use client";

import { useEffect, useState } from "react";
import { getMikaParameterDescriptors, Mika, MikaPresets } from "synthlet";
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
    const randomPresetName =
      presetNames[Math.floor(Math.random() * presetNames.length)];
    loadPreset(randomPresetName);
    return () => {
      mika.destroy();
    };
  }, []);

  function loadPreset(presetName: string) {
    const preset = MikaPresets.find((p) => p.name === presetName);
    if (preset) mika?.setPreset(preset);
    setPresetName(presetName);
  }

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
        <div className="flex gap-2 mb-2 no-select">
          <button
            className="bg-zinc-700 rounded px-3 py-0.5 shadow"
            onClick={() => {
              const index = presetNames.indexOf(presetName);
              if (index > 0) loadPreset(presetNames[index - 1]);
            }}
          >
            &larr;
          </button>
          <select
            className="bg-zinc-700 rounded"
            value={presetName}
            onChange={(e) => {
              loadPreset(e.target.value);
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
              const index = presetNames.indexOf(presetName);
              if (index < presetNames.length - 1)
                loadPreset(presetNames[index + 1]);
            }}
          >
            &rarr;
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
        <ParamControls
          className="mt-4"
          params={MikaPresets.find((p) => p.name === presetName)?.params}
        />
      </div>
    </div>
  );
}

const descriptors = getMikaParameterDescriptors();

export function ParamControls({
  className,
  params,
}: {
  className?: string;
  params?: Record<string, number>;
}) {
  return (
    <div className={className}>
      {descriptors.map((param) => (
        <div key={param.name} className="flex gap-2 my-2">
          <label className="w-28 text-right text-xs">{param.name}</label>
          <input
            className="w-60"
            type="range"
            min={param.minValue}
            max={param.maxValue}
            value={params?.[param.name] ?? param.defaultValue}
            onChange={(e) => {}}
          />
        </div>
      ))}
    </div>
  );
}
