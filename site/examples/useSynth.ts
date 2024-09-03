import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useState } from "react";

export type CreateSynth<T extends Synth> = (context: AudioContext) => T;
export type Synth = {
  connect(destination: AudioNode): void;
  dispose: () => void;
};

export function useSynth<T extends Synth>(createSynth: CreateSynth<T>) {
  const [synth, setSynth] = useState<T | null>(null);

  useEffect(() => {
    console.log("connecting");
    let bye = false;
    let synth: T;
    createSynthAudioContext().then((context) => {
      if (bye) return;
      synth = createSynth(context);
      synth.connect(context.destination);
      console.log("connected", synth);
      setSynth(synth);
    });
    return () => {
      bye = true;
      console.log("disconnecting", synth);
      synth?.dispose();
    };
  }, []);

  return synth;
}
