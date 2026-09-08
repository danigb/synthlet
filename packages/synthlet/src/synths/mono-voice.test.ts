import { AdsrAmp, AdsrEnv } from "@synthlet/adsr";
import type { PresetBank } from "@synthlet/instrument";
import { Instrument, toFrequency } from "@synthlet/instrument";
import { Lfo } from "@synthlet/lfo";
import { PolyblepOscillator } from "@synthlet/polyblep-oscillator";
import { Svf } from "@synthlet/state-variable-filter";
import {
  AudioNodeMock,
  AudioParamMock,
  AudioWorkletNodeMock,
  ConstantSourceNodeMock,
  createAudioContextMock,
  GainNodeMock,
} from "../test-utils";
import type { ParamDescriptor } from "../_worklet";
import { MonoSynth } from "./mono";
import { monoVoice, MonoVoiceParam } from "./mono-voice";

// The first real definition, and the ticket that finds what the stub could not.
//
// `index.test.ts` in `@synthlet/instrument` builds against a `create` that
// returns a gain with two params on it. That stub cannot say whether an inlet
// passed as a sub-input survives the compound's own `...inputs.x` spread,
// whether `fromDescriptor` covers a real parameter list, or whether the
// definition's defaults are the sound the compound already made. This file does.

/** The mock behind a node or param the module built against the DOM types. */
const asNode = (x: unknown) => x as unknown as AudioNodeMock;
const asParam = (x: unknown) => x as unknown as AudioParamMock;

type Bare = ReturnType<typeof MonoSynth>;

/**
 * The ticket's table, transcribed: for every declared parameter, the module
 * whose descriptors its range comes from, the descriptor's name, and the
 * `AudioParam` on a voice it has to reach.
 *
 * A `null` module is a parameter whose range is this definition's own - the
 * two the compound used to bury as constants.
 */
type Module = { descriptors: readonly ParamDescriptor[] };

const TARGETS: Record<
  MonoVoiceParam,
  [Module | null, string, (voice: Bare) => AudioParam]
> = {
  cutoff: [null, "offset", (v) => v.filterEnv.offset],
  envAmount: [null, "gain", (v) => v.filterEnv.gain],
  resonance: [Svf, "Q", (v) => v.filter.Q],
  filterAttack: [AdsrEnv, "attack", (v) => v.filterEnv.attack],
  filterDecay: [AdsrEnv, "decay", (v) => v.filterEnv.decay],
  filterSustain: [AdsrEnv, "sustain", (v) => v.filterEnv.sustain],
  filterRelease: [AdsrEnv, "release", (v) => v.filterEnv.release],
  attack: [AdsrAmp, "attack", (v) => v.amp.attack],
  decay: [AdsrAmp, "decay", (v) => v.amp.decay],
  sustain: [AdsrAmp, "sustain", (v) => v.amp.sustain],
  release: [AdsrAmp, "release", (v) => v.amp.release],
  vibratoRate: [Lfo, "frequency", (v) => v.vibrato.frequency],
  vibratoDepth: [Lfo, "gain", (v) => v.vibrato.gain],
  vibratoDelay: [Lfo, "attack", (v) => v.vibrato.attack],
  waveform: [PolyblepOscillator, "type", (v) => v.osc.type],
  bend: [PolyblepOscillator, "detune", (v) => v.osc.detune],
};

const KEYS = Object.keys(TARGETS) as MonoVoiceParam[];

type Built = {
  context: AudioContext;
  nodes: AudioNodeMock[];
  synth: ReturnType<typeof Instrument<MonoVoiceParam, Bare>>;
};

async function built(voices = 8): Promise<Built> {
  const { context, nodes } = createAudioContextMock();
  const synth = Instrument(context, monoVoice, { voices });
  await synth.ready;
  return { context, nodes, synth };
}

/** The fan-out `ConstantSourceNode` behind one published parameter. */
const fanoutFor = (built: Built, key: MonoVoiceParam) =>
  built.nodes.find(
    (node): node is ConstantSourceNodeMock =>
      node instanceof ConstantSourceNodeMock &&
      node.offset === asParam(built.synth.params[key]),
  );

describe("the definition", () => {
  it("declares every parameter the ticket's table names", () => {
    expect(Object.keys(monoVoice.params).sort()).toEqual([...KEYS].sort());
  });

  it("declares no reserved key and no per-note parameter", () => {
    for (const key of ["glide", "legato", "priority", "gate", "frequency"]) {
      expect(monoVoice.params).not.toHaveProperty(key);
    }
    // `volume` is the instrument's own output gain, not a voice parameter.
    expect(monoVoice.params).not.toHaveProperty("volume");
  });

  it("keeps every range inside the module's own", () => {
    for (const key of KEYS) {
      const [module, name] = TARGETS[key];
      const spec = monoVoice.params[key];
      expect(spec.min).toBeLessThan(spec.max);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      if (!module) continue;
      // An `AudioParam` clamps its computed value to the descriptor's range,
      // so a declared range wider than the descriptor's is a slider whose top
      // end does nothing.
      const descriptor = module.descriptors.find((d) => d.name === name)!;
      expect(spec.min).toBeGreaterThanOrEqual(descriptor.minValue);
      expect(spec.max).toBeLessThanOrEqual(descriptor.maxValue);
    }
  });
});

describe("an Instrument built from it", () => {
  it("builds n voices, one fan-out per parameter, and registers five worklets", async () => {
    // What one compound costs, counted rather than assumed.
    const bare = createAudioContextMock();
    MonoSynth(bare.context);
    const perVoice = bare.nodes.length;

    const { context, nodes, synth } = await built(8);

    expect(synth.voices).toHaveLength(8);
    // The output gain, one fan-out node per parameter, and per voice the
    // compound plus the gain the allocator owns.
    expect(nodes).toHaveLength(1 + KEYS.length + 8 * (perVoice + 1));
    expect(
      nodes.filter((n) => n instanceof ConstantSourceNodeMock),
    ).toHaveLength(KEYS.length);
    expect((context as any).addedModules).toHaveLength(5);
  });

  it("builds eight independent voices", async () => {
    const { synth } = await built(8);

    // One node per parameter is shared between the voices; the parameters it
    // is connected to are not. Eight voices sharing a filter would be one
    // voice with the polyphony of a chorus.
    for (const key of KEYS) {
      const targets = new Set<object>(
        synth.voices.map(
          (voice) => TARGETS[key][2](voice) as unknown as object,
        ),
      );
      expect(targets.size).toBe(8);
    }
  });

  // Criterion 2: the table above, as a test.
  it.each(KEYS)("fans %s out to every voice", async (key) => {
    const b = await built(8);
    const fanout = fanoutFor(b, key);

    expect(fanout).toBeDefined();
    const targets = b.synth.voices.map((voice) => TARGETS[key][2](voice));
    expect(targets).toHaveLength(8);
    for (const target of targets) {
      expect(fanout!.connections).toContain(target);
    }
  });

  it("publishes each parameter as the fan-out node's offset", async () => {
    const b = await built(2);
    for (const key of KEYS) {
      expect(b.synth.params[key]).toBe(fanoutFor(b, key)!.offset);
    }
  });
});

describe("the defaults are the compound's own sound", () => {
  it("declares what a bare MonoSynth builds", () => {
    const { context } = createAudioContextMock();
    const bare = MonoSynth(context);

    for (const key of KEYS) {
      const [module, name, pick] = TARGETS[key];
      const param = asParam(pick(bare));
      // The mock starts every `AudioParam` at 0 and never sees a worklet's
      // descriptors, so a non-zero value is a number the compound passed in
      // and a zero is a parameter it left at the descriptor's own default -
      // which is what the same graph reads in a real context.
      const descriptor = module?.descriptors.find((d) => d.name === name);
      const sounds =
        param.value !== 0 ? param.value : (descriptor?.defaultValue ?? 0);

      expect(monoVoice.params[key].default).toBe(sounds);
    }
  });

  it("round-trips Init as the defaults", async () => {
    const { synth } = await built(2);

    synth.setPreset("Init");
    const preset = synth.getPreset("Init");

    for (const key of KEYS) {
      expect(preset.params[key]).toBe(monoVoice.params[key].default);
    }
  });
});

describe("a note", () => {
  it("writes the pitch on the voice's oscillator and the gate on its inlet", async () => {
    const { context, nodes, synth } = await built(4);
    (context as any).currentTime = 1;

    const { voice } = synth.start({ note: 60 });

    expect(voice).toBe(synth.voices[0]);
    expect(asParam(voice!.frequency)).toBe(asParam(voice!.osc.frequency));
    expect(asParam(voice!.frequency).events).toContainEqual({
      method: "setValueAtTime",
      value: toFrequency(60),
      time: 1,
    });
    expect(toFrequency(60)).toBeCloseTo(261.63, 2);

    // The gate the instrument writes is the compound's own inlet: the `input`
    // of the `Param` node that fans it out to the two envelopes and the LFO.
    const gateNode = nodes.find(
      (node): node is AudioWorkletNodeMock =>
        node instanceof AudioWorkletNodeMock &&
        node.kind === "ParamProcessor" &&
        node.parameters.get("input") === asParam(voice!.gate),
    );
    expect(gateNode).toBeDefined();
    expect(asParam(voice!.gate).events).toContainEqual({
      method: "setValueAtTime",
      value: 1,
      time: 1,
    });
  });

  it("lands on the voice's own gain, not on the shared output", async () => {
    const { context, synth } = await built(4);
    (context as any).currentTime = 2;

    synth.start({ note: 60, velocity: 127 });
    synth.start({ note: 64, velocity: 64 });

    // Two different gains, because velocity is per note.
    const gains = synth.voices
      .slice(0, 2)
      .map((voice) => asNode(voice).connections[0] as unknown as GainNodeMock);
    expect(gains[0].gain.events.at(-1)!.value).toBeCloseTo(1, 6);
    expect(gains[1].gain.events.at(-1)!.value).toBeCloseTo((64 / 127) ** 2, 6);
    expect(asParam(synth.volume).events).toEqual([]);
  });
});

// Criterion 6, and it is a *compile-time* claim: never called, and the
// `@ts-expect-error` is the assertion - remove the typo and this file stops
// building, which is the only way a type test can fail.
const _misspeltBankEntry: PresetBank<MonoVoiceParam> = {
  Typo: {
    // @ts-expect-error - "cutof" is not a parameter of monoVoice
    cutof: 300,
  },
};

describe("the bank", () => {
  it("is Init, Bass and Pad, in declaration order", async () => {
    const { synth } = await built(2);
    expect(synth.presets).toEqual(["Init", "Bass", "Pad"]);
  });

  it.each(["Bass", "Pad"])(
    "%s differs from Init in cutoff, attack and release",
    async (name) => {
      const { synth } = await built(2);

      synth.setPreset(name);
      const sound = synth.getPreset(name);

      for (const key of ["cutoff", "attack", "release"] as MonoVoiceParam[]) {
        expect(sound.params[key]).not.toBe(monoVoice.params[key].default);
      }
    },
  );

  it("writes every parameter on every load, so a sound is not a diff", async () => {
    const { context, synth } = await built(2);
    (context as any).currentTime = 3;

    synth.setPreset("Pad");
    synth.setPreset("Init", { time: 4 });

    for (const key of KEYS) {
      const events = asParam(synth.params[key]).events;
      expect(events.at(-1)).toEqual({
        method: "setValueAtTime",
        value: monoVoice.params[key].default,
        time: 4,
      });
    }
  });

  it("carries Bass's glide as an instrument option", async () => {
    const { synth } = await built(1);

    synth.setPreset("Bass");

    expect(synth.glide).toBe(0.04);
  });

  it("rejects a misspelt key at runtime too", () => {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, monoVoice, { voices: 1 });

    expect(() =>
      // @ts-expect-error - "cutof" is not a parameter of monoVoice, and the
      // bank is typed against its own `P`, so a typo in a factory preset is a
      // build error rather than a runtime throw. This is the runtime half.
      synth.setPreset({ name: "typo", params: { cutof: 300 } }),
    ).toThrow(/Unknown parameter "cutof"/);
  });
});

// Criterion 5: the compound is still a compound. `ArpExample.tsx` builds this
// exact construction, and the definition wraps it rather than replacing it.
describe("MonoSynth is still patchable", () => {
  it("connects a gate signal and a frequency signal where it always did", () => {
    const { context } = createAudioContextMock();
    const euclid = new GainNode(context);
    const arp = new GainNode(context);

    const synth = MonoSynth(context, { gate: euclid, frequency: arp });

    expect(asNode(euclid).connections).toContain(asParam(synth.gate));
    expect(asNode(arp).connections).toContain(asParam(synth.osc.frequency));
  });

  it("still builds the buried constants when nothing is passed", () => {
    const { context } = createAudioContextMock();

    const synth = MonoSynth(context);

    expect(asParam(synth.filterEnv.offset).value).toBe(2000);
    expect(asParam(synth.filterEnv.gain).value).toBe(3000);
    expect(asParam(synth.vibrato.frequency).value).toBe(5);
    expect(asParam(synth.vibrato.gain).value).toBe(5);
    expect(asParam(synth.vibrato.attack).value).toBe(0.6);
  });

  it("lets filterEnv override them", () => {
    const { context } = createAudioContextMock();

    const synth = MonoSynth(context, {
      filterEnv: { offset: 400, gain: 6000, attack: 1.5 },
    });

    expect(asParam(synth.filterEnv.offset).value).toBe(400);
    expect(asParam(synth.filterEnv.gain).value).toBe(6000);
    expect(asParam(synth.filterEnv.attack).value).toBe(1.5);
  });
});
