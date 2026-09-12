import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useState } from "react";
import { useEnclosingSynthSlot } from "./components/SynthSlot";

export type CreateSynth<T extends Synth> = (context: AudioContext) => T;
export type Synth = {
  connect(destination: AudioNode): void;
  dispose: () => void;
};

export function useSynth<T extends Synth>(createSynth: CreateSynth<T>) {
  const [synth, setSynth] = useState<T | null>(null);
  // The pane above wants to meter whatever this builds. Publishing it is the
  // hook's whole involvement - the meter itself belongs to the chrome.
  const slot = useEnclosingSynthSlot();

  useEffect(() => {
    console.log("useSynth connecting");
    let bye = false;
    let synth: T;
    createSynthAudioContext().then((context) => {
      if (bye) return;
      synth = createSynth(context);
      synth.connect(context.destination);
      console.log("useSynth connected", synth);
      setSynth(synth);
      slot?.set(synth);
    });
    return () => {
      bye = true;
      slot?.set(null);
      console.log("useSynth dispose", synth);
      synth?.dispose();
    };
  }, []);

  return synth;
}
