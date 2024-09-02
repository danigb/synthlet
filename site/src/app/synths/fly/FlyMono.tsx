"use client";

import { createSynthAudioContext } from "@/audio-context";
import { AdsrControls } from "@/components/AdsrControls";
import { FrequencySelector } from "@/components/FrequencySelector";
import { GateControls } from "@/components/GateControls";
import { Slider } from "@/components/Slider";
import { StateVariableFilterControls } from "@/components/StateVariableFilterControls";
import { LfoWorklet } from "@synthlet/lfo";
import { useEffect, useState } from "react";
import {
  AdsrWorkletNode,
  createAdsr,
  createLfo,
  createPolyblepOscillator,
  createStateVariableFilter,
  createVca,
  PolyblepOscillatorWorkletNode,
  PolyblepWaveformType,
  StateVariableFilterWorkletNode,
} from "synthlet";

export function FlyMono() {
  const WAVEFORM_TYPES = ["sine", "sawtooth", "square", "triangle"] as const;

  const [synth, setSynth] = useState<FlyMonoSynth | null>(null);
  const [selectedWaveform, setSelectedWaveform] = useState<string>(
    WAVEFORM_TYPES[0]
  );

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
        <h2 className="border-b border-blue-400">Oscillator</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <p className="text-right">type</p>
          <select
            className="bg-blue-700 p-1 rounded border-blue-300 col-span-3"
            value={selectedWaveform}
            onChange={(e) => {
              setSelectedWaveform(e.target.value);
              synth.osc.type = e.target.value as PolyblepWaveformType;
            }}
          >
            {WAVEFORM_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <FrequencySelector
            onChange={(freq) => {
              return synth.osc.frequency.setValueAtTime(freq, 0);
            }}
            label="frequency"
            initial={440}
          />
          <Slider
            label="Mod"
            inputClassName="col-span-2"
            min={0}
            max={100}
            step={1}
            initial={0}
            onChange={(value) => {
              synth.lfo.gain.setValueAtTime(value, 0);
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <h2 className="border-b border-blue-400">LFO</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <Slider
            label="Frequency"
            inputClassName="col-span-2"
            min={1}
            max={100}
            step={1}
            initial={10}
            onChange={(value) => {
              synth.lfo.frequency.setValueAtTime(value, 0);
            }}
          />
        </div>
      </div>

      <div className="mt-4">
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
            adsr={[0.01, 0.1, 0.5, 0.1]}
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
            adsr={[0.01, 0.1, 0.5, 0.1]}
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

class FlyMonoSynth {
  osc: PolyblepOscillatorWorkletNode;
  filter: StateVariableFilterWorkletNode;
  vca: AdsrWorkletNode;
  filterEnv: AdsrWorkletNode;
  $gate: ConstantSourceNode;
  lfo: LfoWorklet;

  constructor(public readonly context: AudioContext) {
    this.$gate = new ConstantSourceNode(context, { offset: 0 });
    this.osc = createPolyblepOscillator(context);
    this.lfo = createLfo(context, {
      frequency: 1,
    });
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

    this.lfo.connect(this.osc.frequency);
    this.$gate.connect(this.filterEnv.gate);
    this.$gate.connect(this.vca.gate);
    this.$gate.start();
  }

  gate(on: boolean) {
    let value = on ? 1 : 0;
    this.$gate.offset.value = value;
  }
}
