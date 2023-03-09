import { PROCESSOR } from "./processor";

const PARAMS = ["note", "trigger"] as const;

const init = new WeakMap<AudioContext, Promise<void>>();

async function createSynthletWorkletNode(context: AudioContext) {
  let ready = init.get(context);
  if (!ready) {
    const blob = new Blob([PROCESSOR], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    ready = context.audioWorklet.addModule(url);
    init.set(context, ready);
  }
  await ready;

  const synth = new AudioWorkletNode(context, "SynthletWorklet", {
    outputChannelCount: [2],
  });
  return synth;
}

export class Synthlet {
  #synthlet: AudioWorkletNode | undefined;
  #ready: Promise<this>;
  #output: AudioNode;

  constructor(context: AudioContext) {
    this.#output = context.destination;
    this.#output.connect(context.destination);
    this.#ready = createSynthletWorkletNode(context).then((synth) => {
      synth.connect(this.#output);
      this.#synthlet = synth;
      return this;
    });
  }

  start(time: number) {
    this.#synthlet?.parameters.get("trigger")?.setValueAtTime(1, time);
  }

  release(time: number) {
    this.#synthlet?.parameters.get("trigger")?.setValueAtTime(0, time);
  }

  setNote(note: number, time: number) {
    this.#synthlet?.parameters.get("note")?.setValueAtTime(note, time);
  }

  get paramNames() {
    return PARAMS;
  }

  getParam(name: typeof PARAMS[number]): AudioParam | undefined {
    return this.#synthlet?.parameters.get("preDelay");
  }

  get isReady(): boolean {
    return this.#synthlet !== undefined;
  }

  ready(): Promise<this> {
    return this.#ready;
  }

  connect(output: AudioNode) {
    if (this.#synthlet) {
      this.#synthlet.disconnect(this.#output);
      this.#synthlet.connect(output);
    }
    this.#output = output;
  }
}
