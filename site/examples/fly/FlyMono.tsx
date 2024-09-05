"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { StateVariableFilterControls } from "@/components/StateVariableFilterControls";
import { AdsrControls } from "@/examples/components/AdsrControls";
import { FrequencySelector } from "@/examples/components/FrequencySelector";
import { GateControls } from "@/examples/components/GateControls";
import { Selector } from "@/examples/components/Selector";
import { Slider } from "@/examples/components/Slider";
import {
  createLfoNode,
  getLfoWaveformTypes,
  LfoWaveformType,
  LfoWorklet,
} from "@synthlet/lfo";
import { useEffect, useState } from "react";
import {
  AdsrWorkletNode,
  ChorusTWorkletNode,
  createAdsrGenNode,
  createChorusTNode,
  createPolyblepOscillatorNode,
  createStateVariableFilterNode,
  createVcaNode,
  PolyblepOscillatorWorkletNode,
  StateVariableFilterWorkletNode,
} from "synthlet";

export function FlyMono() {
  const WAVEFORM_TYPES = ["sine", "sawtooth", "square", "triangle"] as const;

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
        <h2 className="border-b border-blue-400">Oscillator</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
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
          <Selector
            name="type"
            selectClassName="bg-blue-700 p-1 rounded border-blue-300 col-span-3"
            values={getLfoWaveformTypes()}
            initialValue={"Triangle"}
            onChange={(value) => {
              synth.lfo.type = value as LfoWaveformType;
            }}
            initialize
          />
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
      <div className="mt-4">
        <h2 className="border-b border-blue-400">Effects</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 w-[30rem]">
          <p>Chorus</p>
          <Checkbox
            label="Bypass"
            initial={true}
            onChange={(value) => {
              synth.chorus.setBypass(value);
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

function Checkbox({
  label,
  initial,
  onChange,
}: {
  label: string;
  initial: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <label>
      <input
        className="mr-2"
        type="checkbox"
        checked={value}
        onChange={(e) => {
          setValue(e.target.checked);
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}

class FlyMonoSynth {
  osc: PolyblepOscillatorWorkletNode;
  filter: StateVariableFilterWorkletNode;
  vca: AdsrWorkletNode;
  filterEnv: AdsrWorkletNode;
  $gate: ConstantSourceNode;
  lfo: LfoWorklet;
  chorus: ChorusTWorkletNode;

  constructor(public readonly context: AudioContext) {
    this.$gate = new ConstantSourceNode(context, { offset: 0 });
    this.osc = createPolyblepOscillatorNode(context);
    this.lfo = createLfoNode(context, {
      frequency: 1,
    });
    this.filter = createStateVariableFilterNode(context, {
      type: "lowpass",
      frequency: 10,
    });
    this.filterEnv = createAdsrGenNode(context, { gain: 5000, gate: 0 });
    this.filterEnv.connect(this.filter.frequency);
    this.vca = createVcaNode(context, { gate: 0 });
    this.chorus = createChorusTNode(context);
    this.chorus.setBypass(true);
    this.osc
      .connect(this.vca)
      .connect(this.filter)
      .connect(this.chorus)
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
