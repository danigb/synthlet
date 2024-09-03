import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useState } from "react";

type Synth = {
  connect(destination: AudioNode): void;
  dispose: () => void;
};

export function useSynth<T extends Synth>(
  createSynth: (context: AudioContext) => T
) {
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
