"use client";

import { useEffect, useState } from "react";
import { midiToFreq } from "src/midiToFreq";
import {
  Adsr,
  AdsrNode,
  LFO_WAVEFORM_NAMES,
  Lfo,
  LfoNode,
  LfoWaveform,
  loadSynthlet,
} from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { Slider } from "../Slider";
import { getAudioContext } from "../audio-context";

class LfoExampleSynth {
  osc: OscillatorNode;
  lfoSpeed: LfoNode;
  lfoDetune: LfoNode;
  env: AdsrNode;

  static params = {
    lfoSpeed: {
      frequency: 1.5,
      gain: 4,
      waveform: LfoWaveform.Sine,
    },
    lfoDetune: {
      frequency: 10,
      gain: 500,
      waveform: LfoWaveform.Sine,
      quantize: 0,
    },
    env: {
      attack: 0.1,
      decay: 0.1,
      sustain: 0.2,
      release: 1,
    },
  };

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context);

    this.lfoSpeed = Lfo(context, LfoExampleSynth.params.lfoSpeed);
    this.lfoDetune = Lfo(context, LfoExampleSynth.params.lfoDetune);
    this.env = Adsr(context, LfoExampleSynth.params.env);
    this.lfoSpeed.connect(this.lfoDetune.frequency);
    this.lfoDetune.connect(this.osc.detune);
    this.osc.connect(this.env).connect(context.destination);
    this.osc.start();
  }

  pressKey({ note }: { note: number }) {
    this.osc.frequency.value = midiToFreq(note);
    this.env.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.osc.disconnect();
    this.env.disconnect();
    this.lfoDetune.disconnect();
    this.lfoSpeed.disconnect();
  }
}

export function LfoExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<LfoExampleSynth | undefined>(undefined);
  const [frequencySpeed, setFrequencySpeed] = useState(
    LfoExampleSynth.params.lfoSpeed.frequency
  );
  const [gainSpeed, setGainSpeed] = useState(
    LfoExampleSynth.params.lfoSpeed.gain
  );
  const [frequency, setFrequency] = useState(
    LfoExampleSynth.params.lfoDetune.frequency
  );
  const [detune, setDetune] = useState(
    LfoExampleSynth.params.lfoDetune.gain / 100
  );
  const [quantize, setQuantize] = useState(
    LfoExampleSynth.params.lfoDetune.quantize
  );
  const [waveform, setWaveform] = useState(
    LfoExampleSynth.params.lfoDetune.waveform
  );

  useEffect(() => {
    let synth: LfoExampleSynth | undefined = undefined;
    loadSynthlet(getAudioContext()).then(() => {
      synth = new LfoExampleSynth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl text-cyan-500">Lfo </h1>
        <p>
          A<span className="text-cyan-600"> Lfo </span>
          controlling the speed of another
          <span className="text-cyan-600"> Lfo </span>
          controlling the detune of an OscillatorNode
        </p>
      </div>

      <label className="text-zinc-200">Lfo1 controlling the Lfo2 speed</label>
      <div className="flex items-center gap-2 mb-2 text-zinc-400">
        <Slider
          name="Frequency"
          value={frequencySpeed}
          min={0.1}
          max={20}
          onChange={setFrequencySpeed}
          param={synth?.lfoSpeed.frequency}
        />
        <Slider
          name="Amount"
          value={gainSpeed}
          min={0}
          max={5}
          onChange={setGainSpeed}
          param={synth?.lfoSpeed.gain}
        />
      </div>
      <label className="text-zinc-200">Lfo2 controlling the pitch</label>
      <div className="flex items-center gap-2 mb-2 text-zinc-400">
        <select
          className="bg-zinc-700 rounded py-[2px]"
          value={waveform}
          onChange={(e) => {
            const waveform = parseInt(e.target.value) as LfoWaveform;
            synth?.lfoDetune.waveform.setValueAtTime(waveform, 0);
            console.log(synth?.lfoDetune.waveform);
            setWaveform(waveform);
          }}
        >
          {LFO_WAVEFORM_NAMES.map((name, index) => (
            <option key={name} value={"" + index}>
              {name}
            </option>
          ))}
        </select>
        <Slider
          name="Frequency"
          value={frequency}
          min={0.1}
          max={20}
          onChange={setFrequency}
          param={synth?.lfoDetune.frequency}
        />
        <Slider
          name="Detune (semitones)"
          value={detune}
          min={1}
          max={12}
          onChange={setDetune}
          param={(value) => {
            synth?.lfoDetune.gain.setValueAtTime(value * 100, 0);
          }}
        />
        <Slider
          name="Quantize"
          value={quantize}
          min={0}
          max={100}
          onChange={setQuantize}
          param={synth?.lfoDetune.quantize}
        />
      </div>
      <div className="flex gap-2 mt-4 mb-2">
        <ConnectMidi
          instrument={{
            start(note) {
              synth?.pressKey(note);
            },
            stop(note) {
              synth?.releaseKey({ note: note.stopId });
            },
          }}
        />
      </div>
      <div className="">
        <PianoKeyboard
          borderColor="border-cyan-700"
          onPress={(note) => {
            synth?.pressKey(note);
          }}
          onRelease={(note) => {
            synth?.releaseKey({ note });
          }}
          hold
        />
      </div>
    </div>
  );
}
