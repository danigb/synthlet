import { Generator, Kick, Snare } from "./drums";

function createInstrument(type: string): Generator {
  switch (type) {
    case "kick":
      return Kick(sampleRate);
    case "snare":
      return Snare(sampleRate);
    default:
      throw new Error("Invalid instrument: " + type);
  }
}

export class Drum8WorkletProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: (output: Float32Array, params: any) => void;

  constructor(options: any) {
    super();
    this.r = true;
    const type = options?.processorOptions?.type ?? "";
    this.g = createInstrument(type);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISCONNECT":
          this.r = false;
          break;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.g(outputs[0][0], parameters);
    return this.r;
  }

  static get parameterDescriptors() {
    const ATTACK = 0.01;
    const DECAY = 0.5;
    return [
      ["gate", 0, 0, 1],
      ["attack", ATTACK, 0, 2],
      ["decay", DECAY, 0, 10],
      ["level", 0.8, 0, 1],
      ["snap", 0.2, 0, 1],
      ["tone", 0.2, 0, 1],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
  }
}

registerProcessor("Drum8WorkletProcessor", Drum8WorkletProcessor);
