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
  lfo: LfoNode;
  env: AdsrNode;

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context);
    this.lfo = Lfo(context, {
      frequency: 10,
      gain: 100,
      waveform: LfoWaveform.RandSampleHold,
      quantize: 50,
    });
    this.env = Adsr(context, {
      attack: 0.1,
      decay: 0.1,
      sustain: 0.8,
      release: 1,
    });
    this.lfo.connect(this.osc.detune);
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
    this.lfo.disconnect();
  }
}

export function LfoExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<LfoExampleSynth | undefined>(undefined);
  const [frequency, setFrequency] = useState(10);
  const [detune, setDetune] = useState(5);
  const [quantize, setQuantize] = useState(0);
  const [waveform, setWaveform] = useState(LfoWaveform.RandSampleHold);

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
          oscillator controlling the detune of an OscillatorNode
        </p>
      </div>

      <label className="text-zinc-200">Lfo</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <select
          className="bg-zinc-700 rounded py-[2px]"
          value={waveform}
          onChange={(e) => {
            const waveform = parseInt(e.target.value) as LfoWaveform;
            synth?.lfo.waveform.setValueAtTime(waveform, 0);
            console.log(synth?.lfo.waveform);
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
          param={synth?.lfo.frequency}
        />
        <Slider
          name="Detune (semitones)"
          value={detune}
          min={1}
          max={12}
          onChange={setDetune}
          param={(value) => {
            synth?.lfo.gain.setValueAtTime(value * 100, 0);
          }}
        />
        <Slider
          name="Quantize"
          value={quantize}
          min={0}
          max={100}
          onChange={setQuantize}
          param={synth?.lfo.quantize}
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
        />
      </div>
    </div>
  );
}
