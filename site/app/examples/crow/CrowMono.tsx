"use client";

import { createSynthAudioContext } from "@/audio-context";
import { AdsrControls } from "@/components/AdsrControls";
import { FrequencySelector } from "@/components/FrequencySelector";
import { GateControls } from "@/components/GateControls";
import { Slider } from "@/components/Slider";
import {
  createWavetableOscillatorNode,
  loadWavetable,
  WavetableLoader,
  WavetableOscillatorWorkletNode,
} from "@synthlet/wavetable-oscillator";
import { useEffect, useState } from "react";
import { AdsrWorkletNode, createVcaNode } from "synthlet";

export function CrowMono() {
  const [synth, setSynth] = useState<CrowMonoSynth | null>(null);
  const [currentWavetableName, setCurrentWavetableName] =
    useState<string>("ACCESS_V");
  const [availableNames, setAvailableNames] = useState<string[]>([]);

  useEffect(() => {
    createSynthAudioContext().then((context) => {
      setSynth(new CrowMonoSynth(context, "ACCESS_V"));
    });
    WavetableLoader.fetchAvailableNames().then((names) => {
      names.sort();
      setAvailableNames(names);
    });
  }, []);

  return synth ? (
    <div className="flex flex-col bg-zinc-800 p-4 rounded border border-zinc-600">
      <h1 className="text-xl border-b border-zinc-600">
        Crow Wavetable Synthesizer
      </h1>

      <div className="mt-4">
        <h2 className="border-b border-zinc-400">Oscillator</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <p className="text-right">Wavetable</p>
          <select
            className="col-span-2 bg-zinc-900 p-1 rounded border-zinc-300"
            value={currentWavetableName}
            onChange={(event) => {
              setCurrentWavetableName(event.target.value);
              synth.setWavetable(event.target.value);
            }}
          >
            {availableNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <p></p>

          <FrequencySelector
            onChange={(freq) => {
              return synth.osc.frequency.setValueAtTime(freq, 0);
            }}
            label="frequency"
            initial={440}
          />
          <Slider
            label="morph"
            min={0}
            max={10}
            initial={1}
            step={0.1}
            onChange={(value) => {
              synth.osc.morphFrequency.value = value;
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <h2 className="border-b border-zinc-400">Amplifier</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <AdsrControls
            adsr={[0.01, 0.1, 0.5, 1]}
            onAttackChanged={(attack) => {
              synth.vca.attack.setValueAtTime(attack, 0);
            }}
            onDecayChanged={(decay) => {
              synth.vca.decay.setValueAtTime(decay, 0);
            }}
            onSustainChanged={(sustain) => {
              synth.vca.sustain.setValueAtTime(sustain, 0);
            }}
            onReleaseChanged={(release) => {
              synth.vca.release.setValueAtTime(release, 0);
            }}
          />
        </div>
      </div>
      <GateControls
        onGateChanged={(on) => {
          synth.gate(on);
        }}
      />
    </div>
  ) : (
    <p>Creating synth...</p>
  );
}

class CrowMonoSynth {
  vca: AdsrWorkletNode;
  $gate: ConstantSourceNode;
  osc: WavetableOscillatorWorkletNode;

  constructor(public readonly context: AudioContext, wavetableName: string) {
    this.$gate = new ConstantSourceNode(context, { offset: 0 });
    this.osc = createWavetableOscillatorNode(context, {
      morphFrequency: 1,
    });
    this.vca = createVcaNode(context, { gate: 0 });
    this.osc.connect(this.vca).connect(context.destination);
    this.$gate.connect(this.vca.gate);
    this.$gate.start();
    this.setWavetable(wavetableName);
  }

  gate(on: boolean) {
    let value = on ? 1 : 0;
    this.$gate.offset.value = value;
  }

  setWavetable(name: string) {
    loadWavetable(name).then((wavetable) => {
      this.osc.setWavetable(wavetable.data, wavetable.length);
    });
  }
}
