import { AudioParamMock, createAudioContextMock } from "../test-utils";
import { Gain } from "../waa";
import * as drums from "./drums";
import { MonoSynth } from "./mono";

// A compound's public surface is its API, so it is worth pinning. Every
// compound ends in a Gain, params are flat AudioParams, and a voice (a drum)
// exposes nothing but its knobs while a kit (MonoSynth) also exposes modules.

const drumNames = Object.keys(drums) as (keyof typeof drums)[];

/** The keys a compound adds on top of the plain Gain it ends in. */
const surface = (context: AudioContext, compound: object) => {
  const plain = Gain(context);
  return Object.keys(compound)
    .filter((key) => !(key in plain))
    .sort();
};

describe.each(drumNames)("%s", (name) => {
  const build = drums[name];

  it("ends in a Gain", () => {
    const { context } = createAudioContextMock();
    expect((build(context) as any).kind).toBe("GainNode");
  });

  it("exposes its four knobs and nothing else", () => {
    const { context } = createAudioContextMock();
    const drum = build(context);

    expect(surface(context, drum)).toEqual([
      "decay",
      "tone",
      "trigger",
      "volume",
    ]);
  });

  it("exposes them as AudioParams", () => {
    const { context } = createAudioContextMock();
    const drum = build(context);

    for (const knob of [drum.trigger, drum.tone, drum.decay, drum.volume]) {
      expect(knob).toBeInstanceOf(AudioParamMock);
    }
  });
});

describe("MonoSynth", () => {
  it("ends in a Gain", () => {
    const { context } = createAudioContextMock();
    expect((MonoSynth(context) as any).kind).toBe("GainNode");
  });

  it("exposes its params flat and its modules by name", () => {
    const { context } = createAudioContextMock();
    const synth = MonoSynth(context);

    expect(surface(context, synth)).toEqual([
      "amp",
      "filter",
      "filterEnv",
      "frequency",
      "gate",
      "osc",
      "vibrato",
      "volume",
    ]);
    expect(synth.gate).toBeInstanceOf(AudioParamMock);
    expect(synth.volume).toBeInstanceOf(AudioParamMock);
    // The note, flat beside the gate: what `Instrument` writes into a voice,
    // and `osc.frequency` seen from outside.
    expect(synth.frequency).toBeInstanceOf(AudioParamMock);
    expect(synth.frequency).toBe(synth.osc.frequency);
    // Modules are nodes, and their own params are reachable through them -
    // the site's MonoExample binds sliders to synth.osc.frequency.
    expect(synth.osc.frequency).toBeInstanceOf(AudioParamMock);
    expect(synth.filterEnv.attack).toBeInstanceOf(AudioParamMock);
  });
});
