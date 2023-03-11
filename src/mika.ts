import { createWorklet } from "./createWorklet";
import { MikaParams } from "./mika/mika-params";
import { MikaPreset } from "./mika/mika-presets";
import { PROCESSOR } from "./mika/mika-processor";

const loadWorklet = createWorklet("MikaWorklet", PROCESSOR);

type MikaVoiceMode = "mono" | "legato";

export class Mika {
  worklet: AudioWorkletNode | undefined;
  ready: Promise<this>;
  output: AudioNode;
  mode: MikaVoiceMode = "mono";
  pressedKeys: number[] = [];

  constructor(public readonly context: AudioContext) {
    this.output = context.destination;
    this.ready = loadWorklet(context).then((synth) => {
      synth.connect(this.output);
      this.worklet = synth;
      return this;
    });
  }

  setPreset(preset: MikaPreset | MikaParams) {
    const params = "name" in preset ? preset.params : preset;
    this.worklet?.port.postMessage({ type: "preset-change", params });
  }

  pressKey(keyPress: { note: number; time?: number; velocity?: number }) {
    console.log("pressKey", keyPress);
    const time = keyPress.time ?? this.context.currentTime;
    if (this.mode === "mono") {
      if (!this.pressedKeys.length) {
        console.log("start envelope", time);
        this.getParam("trigger")?.setValueAtTime(1, time);
      }
      this.getParam("note")?.setValueAtTime(keyPress.note, time);
      this.pressedKeys = [keyPress.note];
    }
  }

  releaseKey(keyRelease: { note: number; time?: number }) {
    console.log("releaseKey", keyRelease);
    const time = keyRelease.time ?? this.context.currentTime;
    if (this.mode === "mono") {
      if (this.pressedKeys.length && this.pressedKeys[0] === keyRelease.note) {
        console.log("stop envelope", time);
        this.getParam("trigger")?.setValueAtTime(0, time);
        this.pressedKeys = [];
      }
    }
  }

  get paramNames() {
    return Object.keys(this.worklet?.parameters ?? {});
  }

  getParam(name: string): AudioParam | undefined {
    return this.worklet?.parameters.get(name);
  }

  get isReady(): boolean {
    return this.worklet !== undefined;
  }

  loaded(): Promise<this> {
    return this.ready;
  }

  connect(output: AudioNode) {
    if (this.worklet) {
      this.worklet.disconnect(this.output);
      this.worklet.connect(output);
    }
    this.output = output;
  }

  destroy() {
    if (this.worklet) {
      this.worklet.disconnect(this.output);
      this.worklet = undefined;
    }
  }
}
