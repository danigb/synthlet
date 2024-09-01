"use client";

import { createSynthAudioContext } from "@/audio-context";
import { AdsrControls } from "@/components/AdsrControls";
import { GateControls } from "@/components/GateControls";
import { StateVariableFilterControls } from "@/components/StateVariableFilterControls";
import { useEffect, useState } from "react";
import {
  AdsrWorkletNode,
  createAdsr,
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
        <GateControls
          onGateChanged={(on) => {
            synth.gate(on);
          }}
        />
        <h2 className="border-b border-blue-400">Filter</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <StateVariableFilterControls
            onFrequencyChanged={(freq) => {
              synth.filterEnv.gain.setValueAtTime(freq, 0);
            }}
            onResonanceChanged={(res) => {
              synth.filter.resonance.setValueAtTime(res, 0);
            }}
          />
          <AdsrControls
            onAttackChanged={(attack) => {
              synth.filterEnv.attack.setValueAtTime(attack, 0);
            }}
            onDecayChanged={(decay) => {
              synth.filterEnv.decay.setValueAtTime(decay, 0);
            }}
            onSustainChanged={(sustain) => {
              synth.filterEnv.sustain.setValueAtTime(sustain, 0);
            }}
            onReleaseChanged={(release) => {
              synth.filterEnv.release.setValueAtTime(release, 0);
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <h2 className="border-b border-blue-400">Amplifier</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <AdsrControls
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
    </div>
  ) : (
    <p>Creating synth...</p>
  );
}

class FlyMonoSynth {
  osc: PolyblepOscillatorWorkletNode;
  filter: StateVariableFilterWorkletNode;
  vca: AdsrWorkletNode;
  filterEnv: AdsrWorkletNode;
  $gate: ConstantSourceNode;

  constructor(public readonly context: AudioContext) {
    console.log("CREATE fly");
    this.$gate = new ConstantSourceNode(context, { offset: 0 });
    this.osc = createPolyblepOscillator(context);
    this.filter = createStateVariableFilter(context, {
      type: "lowpass",
      frequency: 10,
    });
    this.filterEnv = createAdsr(context, { gain: 5000, gate: 0 });
    this.filterEnv.connect(this.filter.frequency);
    this.vca = createVca(context, { gate: 0 });
    this.osc
      .connect(this.vca)
      .connect(this.filter)
      .connect(context.destination);
    this.$gate.connect(this.filterEnv.gate);
    this.$gate.connect(this.vca.gate);
    this.$gate.start();
    console.log("ready");
  }

  gate(on: boolean) {
    let value = on ? 1 : 0;
    this.$gate.offset.value = value;
  }
}
