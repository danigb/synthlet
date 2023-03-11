import { createWorklet } from "./createWorklet";
import { MikaParams } from "./mika/mika-params";
import { MikaPreset } from "./mika/mika-presets";
import { PROCESSOR } from "./mika/mika-processor";

const loadWorklet = createWorklet("MikaWorklet", PROCESSOR);

export class Mika {
  worklet: AudioWorkletNode | undefined;
  ready: Promise<this>;
  output: AudioNode;

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

  start(time?: number) {
    time ??= this.context.currentTime;
    this.getParam("trigger")?.setValueAtTime(1, time);
  }

  release(time?: number) {
    time ??= this.context.currentTime;
    this.getParam("trigger")?.setValueAtTime(0, time);
  }

  setNote(note: number, time?: number) {
    time ??= this.context.currentTime;
    this.getParam("note")?.setValueAtTime(note, time);
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
