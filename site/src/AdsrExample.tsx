"use client";

import { useEffect, useState } from "react";
import { AdsrNode, createAdsr, loadAdsr } from "synthlet";
import { ConnectMidi } from "./ConnectMidi";
import { PianoKeyboard } from "./PianoKeyboard";
import { getAudioContext } from "./audio-context";

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class AdsrExampleSynth {
  osc: OscillatorNode;
  gain: GainNode;
  adsr: AdsrNode;
  gate: AudioParam | undefined;

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context, { type: "sine", frequency: 880 });
    this.gain = new GainNode(context, { gain: 1 });
    this.adsr = createAdsr(context);
    this.osc.start();
    this.osc.connect(this.adsr);
    this.adsr.connect(this.gain);
    this.gain.connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    console.log("press", note, this.adsr.gate);
    this.osc.frequency.value = midiToFreq(note);
    this.adsr.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    console.log("release1", note, this.adsr.gate);
    this.adsr.gate.setValueAtTime(0, this.context.currentTime);
    console.log("release2", note, this.adsr.gate);
  }

  destroy() {
    this.gain.disconnect();
    this.osc.disconnect();
  }
}

export function AdsrExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<AdsrExampleSynth | undefined>(undefined);

  useEffect(() => {
    let synth: AdsrExampleSynth | undefined = undefined;
    loadAdsr(getAudioContext()).then(() => {
      synth = new AdsrExampleSynth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
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
              synth?.pressKey(note);
            },
            stop(note) {
              synth?.releaseKey({ note: note.stopId });
            },
          }}
        />
      </div>
      <div className={!synth ? "opacity-30" : ""}>
        <div className="flex gap-2 mb-2 no-select">
          <button
            className="bg-zinc-700 rounded px-3 py-0.5 shadow"
            onClick={() => {}}
          >
            &larr;
          </button>
          <select
            className="bg-zinc-700 rounded"
            value={""}
            onChange={(e) => {}}
          >
            <option key={"none"} value={""}>
              None
            </option>
          </select>
          <button
            className="bg-zinc-700 rounded px-3 py-0.5 shadow"
            onClick={() => {}}
          >
            &rarr;
          </button>
        </div>
        <PianoKeyboard
          borderColor="border-rose-700"
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
