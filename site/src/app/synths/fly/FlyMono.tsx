"use client";

import { createSynthAudioContext } from "@/audio-context";
import { Slider } from "@/components/Slider";
import { midiToFreq } from "@/midi";
import { useEffect, useState } from "react";
import {
  AdsrWorkletNode,
  createPolyblepOscillator,
  createStateVariableFilter,
  createVca,
  PolyblepOscillatorWorkletNode,
  StateVariableFilterWorkletNode,
} from "synthlet";

export function FlyMono() {
  const [synth, setSynth] = useState<FlyMonoSynth | null>(null);

  useEffect(() => {
    createSynthAudioContext().then((context) => {
      setSynth(new FlyMonoSynth(context));
    });
  }, []);

  return synth ? (
    <div className="flex flex-col bg-blue-600 p-4 rounded border border-blue-500">
      <h1 className="text-xl border-b border-blue-400">
        Fly Monophonic Synthesizer
      </h1>

      <div className="mt-4">
        <h2 className="border-b border-blue-400">Filter</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <Slider
            label="frequency"
            labelClassName="text-right"
            inputClassName="col-span-2"
            min={0}
            max={127}
            step={0.1}
            initial={69}
            transform={midiToFreq}
            onChange={() => {}}
          />
        </div>
      </div>

      <div className="mt-4">
        <h2 className="border-b border-blue-400">Amplifier</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <Slider
            label="attack"
            labelClassName="text-right"
            inputClassName="col-span-2"
            min={0.1}
            max={10}
            step={0.1}
            initial={0.2}
            onChange={() => {}}
          />
          <Slider
            label="decay"
            labelClassName="text-right"
            inputClassName="col-span-2"
            min={0.1}
            max={10}
            step={0.1}
            initial={0.2}
            onChange={() => {}}
          />
          <Slider
            label="sustain"
            labelClassName="text-right"
            inputClassName="col-span-2"
            min={0.1}
            max={1}
            step={0.01}
            initial={0.8}
            onChange={() => {}}
          />
          <Slider
            label="release"
            labelClassName="text-right"
            inputClassName="col-span-2"
            min={0.1}
            max={100}
            step={0.2}
            initial={0.2}
            onChange={() => {}}
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          className="border border-white px-1 rounded opacity-70 hover:opacity-80"
          onMouseDown={() => {
            synth.vca.gateOn();
          }}
          onMouseUp={() => {
            synth.vca.gateOff();
          }}
          onMouseLeave={() => {
            synth.vca.gateOff();
          }}
        >
          Gate
        </button>
      </div>
    </div>
  ) : (
    <p>Creating synth...</p>
  );
}

class FlyMonoSynth {
  osc: PolyblepOscillatorWorkletNode;
  filter: StateVariableFilterWorkletNode;
  vca: AdsrWorkletNode;

  constructor(public readonly context: AudioContext) {
    console.log("CREATE fly");
    this.osc = createPolyblepOscillator(context);
    this.filter = createStateVariableFilter(context, {
      type: "lowpass",
      frequency: 5000,
    });
    this.vca = createVca(context);
    this.osc
      .connect(this.filter)
      .connect(this.vca)
      .connect(context.destination);
    console.log("ready");
  }
}
