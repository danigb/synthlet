import {
  AudioParamMock,
  createAudioContextMock,
} from "../../synthlet/src/test-utils";
import { disposable } from "./_worklet";
import { Instrument, InstrumentOptions, Voice, VoiceDefinition } from "./index";
import {
  assertNoReservedParams,
  fromDescriptor,
  presetNames,
  PresetSchema,
  resolvePreset,
} from "./presets";

/**
 * The preset format, on data.
 *
 * Nothing here has a context: a preset is `[key, value]` writes plus the
 * reserved options, and the instrument is what turns them into automation.
 */

const schema: PresetSchema<"cutoff" | "resonance" | "attack"> = {
  name: "stubVoice",
  params: {
    cutoff: { default: 1200, min: 20, max: 20000, unit: "Hz" },
    resonance: { default: 0.5, min: 0, max: 1 },
    attack: { default: 0.01, min: 0, max: 4, unit: "s" },
  },
  presets: {
    Brass: { cutoff: 3000, resonance: 0.8 },
    Pad: { cutoff: 600, attack: 1.5, glide: 0.2 },
  },
};

describe("resolvePreset", () => {
  it("writes every declared parameter, named or not", () => {
    const { writes } = resolvePreset(schema, "Brass");

    expect(writes).toEqual([
      ["cutoff", 3000],
      ["resonance", 0.8],
      // Not named by the preset, so its declared default - a preset is a
      // complete sound, not a diff over whatever was loaded before.
      ["attack", 0.01],
    ]);
  });

  it("keeps the definition's declaration order", () => {
    const { writes } = resolvePreset(schema, { name: "x", params: {} });

    expect(writes.map(([key]) => key)).toEqual([
      "cutoff",
      "resonance",
      "attack",
    ]);
  });

  it("takes an object as it is", () => {
    const { writes } = resolvePreset(schema, {
      name: "by hand",
      params: { resonance: 0.25 },
    });

    expect(writes).toEqual([
      ["cutoff", 1200],
      ["resonance", 0.25],
      ["attack", 0.01],
    ]);
  });

  it("throws on an unknown parameter, naming it and the known ones", () => {
    expect(() =>
      resolvePreset(schema, { name: "typo", params: { cutof: 1 } as any }),
    ).toThrow(
      'Unknown parameter "cutof" for stubVoice; known: cutoff, resonance, attack',
    );
  });

  it("throws on an unknown preset name, naming the bank", () => {
    expect(() => resolvePreset(schema, "Brass 2")).toThrow(
      'Unknown preset "Brass 2" for stubVoice; known: Brass, Pad',
    );
    expect(() => resolvePreset({ params: schema.params }, "Brass")).toThrow(
      'Unknown preset "Brass" for this definition; known: (none)',
    );
  });

  it("clamps a value outside the range, silently", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { writes } = resolvePreset(schema, {
      name: "stale",
      params: { resonance: 1.2, cutoff: 0 },
    });

    expect(writes).toEqual([
      ["cutoff", 20],
      ["resonance", 1],
      ["attack", 0.01],
    ]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("separates the reserved keys from the parameters", () => {
    const fromBank = resolvePreset(schema, "Pad");
    expect(fromBank.options).toEqual({ glide: 0.2 });
    expect(fromBank.writes.map(([key]) => key)).not.toContain("glide");

    const fromObject = resolvePreset(schema, {
      name: "lead",
      params: { cutoff: 900 },
      glide: 0.05,
      legato: true,
      priority: "low",
    });
    expect(fromObject.options).toEqual({
      glide: 0.05,
      legato: true,
      priority: "low",
    });
  });

  it("has no options when the preset carries none", () => {
    expect(resolvePreset(schema, "Brass").options).toEqual({});
  });
});

describe("assertNoReservedParams", () => {
  it("rejects a definition whose params claim a reserved key", () => {
    expect(() =>
      assertNoReservedParams({
        name: "clashing",
        params: { glide: { default: 0, min: 0, max: 1 } },
      }),
    ).toThrow(
      '"glide" is a reserved preset key and cannot be a parameter of ' +
        "clashing; reserved: glide, legato, priority",
    );
  });

  it("passes a definition that does not", () => {
    expect(() => assertNoReservedParams(schema)).not.toThrow();
  });
});

describe("presetNames", () => {
  it("is the bank's names in declaration order", () => {
    expect(presetNames(schema)).toEqual(["Brass", "Pad"]);
  });

  it("is empty for a definition without a bank", () => {
    expect(presetNames({ params: schema.params })).toEqual([]);
  });
});

describe("fromDescriptor", () => {
  const Stub = {
    descriptors: [
      {
        name: "attack",
        defaultValue: 0.1,
        minValue: 0,
        maxValue: 10,
        automationRate: "k-rate",
      },
      {
        name: "decay",
        defaultValue: 0.2,
        minValue: 0,
        maxValue: 10,
        automationRate: "k-rate",
      },
    ],
  } as const;

  it("copies the descriptor's numbers", () => {
    expect(fromDescriptor(Stub, "decay")).toEqual({
      default: 0.2,
      min: 0,
      max: 10,
    });
  });

  it("takes overrides for a tighter range or a different default", () => {
    expect(fromDescriptor(Stub, "attack", { default: 0.01 })).toEqual({
      default: 0.01,
      min: 0,
      max: 10,
    });
    expect(fromDescriptor(Stub, "attack", { max: 4, unit: "s" })).toEqual({
      default: 0.1,
      min: 0,
      max: 4,
      unit: "s",
    });
  });

  it("throws naming the parameter when the list does not have it", () => {
    expect(() => fromDescriptor(Stub, "release")).toThrow(
      'No parameter "release" in the descriptors; known: attack, decay',
    );
  });
});

/**
 * The same format on the instrument.
 *
 * These live here rather than in `index.test.ts` because they are this
 * ticket's feature end to end: a preset is `resolvePreset` plus one
 * `setValueAtTime` per fan-out inlet, and the mock's automation log is where
 * that becomes visible.
 */
describe("on the instrument", () => {
  type Keys = "cutoff" | "resonance" | "attack";

  /** Three parameters and two presets, one of which names two of them. */
  function stub(
    overrides: Partial<VoiceDefinition<Keys, Voice>> = {},
  ): VoiceDefinition<Keys, Voice> {
    return {
      name: "stubVoice",
      params: schema.params,
      presets: {
        Brass: { cutoff: 3000, resonance: 0.8 },
        Pad: { cutoff: 600, attack: 1.5, glide: 0.2 },
      },
      register: async () => {},
      create: (context) =>
        Object.assign(disposable(new GainNode(context)), {
          gate: new AudioParamMock() as unknown as AudioParam,
          frequency: new AudioParamMock() as unknown as AudioParam,
        }),
      ...overrides,
    };
  }

  async function built(options: InstrumentOptions<Keys> = {}) {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stub(), { voices: 2, ...options });
    await synth.ready;
    return { context, synth };
  }

  const events = (param: AudioParam) =>
    (param as unknown as AudioParamMock).events;

  it("writes every declared parameter, at currentTime", async () => {
    const { context, synth } = await built();
    (context as any).currentTime = 1.5;

    synth.setPreset("Brass");

    // Three parameters, one preset naming two: three writes.
    expect(events(synth.params.cutoff)).toEqual([
      { method: "setValueAtTime", value: 3000, time: 1.5 },
    ]);
    expect(events(synth.params.resonance)).toEqual([
      { method: "setValueAtTime", value: 0.8, time: 1.5 },
    ]);
    expect(events(synth.params.attack)).toEqual([
      { method: "setValueAtTime", value: 0.01, time: 1.5 },
    ]);
  });

  it("writes all of them at `time`, and nothing at currentTime", async () => {
    const { synth } = await built();

    synth.setPreset("Brass", { time: 4 });

    for (const key of ["cutoff", "resonance", "attack"] as const) {
      expect(events(synth.params[key]).map((e) => e.time)).toEqual([4]);
    }
  });

  it("does not inherit the sound it replaces", async () => {
    const { synth } = await built();

    synth.setPreset("Pad");
    synth.setPreset("Brass");

    // "Brass" does not name `attack`, so the pad's 1.5 does not survive it.
    expect(events(synth.params.attack).map((e) => e.value)).toEqual([
      1.5, 0.01,
    ]);
  });

  it("throws on an unknown key and clamps a stale value", async () => {
    const { synth } = await built();

    expect(() =>
      synth.setPreset({ name: "typo", params: { cutof: 1 } as any }),
    ).toThrow(/Unknown parameter "cutof" for stubVoice/);
    synth.setPreset({ name: "stale", params: { resonance: 9 } });

    expect(events(synth.params.resonance).at(-1)!.value).toBe(1);
  });

  it("round-trips through getPreset", async () => {
    const { synth } = await built();
    const brass = { name: "Brass", params: { cutoff: 3000, resonance: 0.8 } };

    synth.setPreset(brass);
    const read = synth.getPreset("Brass");

    expect(read.params).toEqual({ cutoff: 3000, resonance: 0.8, attack: 0.01 });
    const before = events(synth.params.attack).length;
    synth.setPreset(read);
    expect(events(synth.params.attack).length).toBe(before + 1);
    expect(events(synth.params.cutoff).at(-1)!.value).toBe(3000);
  });

  it("names the preset `untitled` when nothing else is asked for", async () => {
    const { synth } = await built();

    expect(synth.getPreset().name).toBe("untitled");
  });

  it("gives back the defaults before ready, with nothing to read", () => {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stub(), { voices: 2 });

    expect(synth.getPreset().params).toEqual({
      cutoff: 1200,
      resonance: 0.5,
      attack: 0.01,
    });
  });

  it("sets the instrument options a preset carries", async () => {
    const { synth } = await built();

    synth.setPreset("Pad");

    expect(synth.glide).toBe(0.2);
    // And it is not a parameter: nothing was written for it.
    expect(Object.keys(synth.params)).toEqual([
      "cutoff",
      "resonance",
      "attack",
    ]);
  });

  it("rejects a definition whose params claim a reserved key", () => {
    const { context } = createAudioContextMock();

    expect(() =>
      Instrument(context, {
        ...stub(),
        params: { glide: { default: 0, min: 0, max: 1 } },
        presets: undefined,
      } as unknown as VoiceDefinition<Keys, Voice>),
    ).toThrow(/reserved: glide, legato, priority/);
  });

  it("applies `options.preset` before a note queued ahead of ready", async () => {
    const spy = jest.spyOn(AudioParamMock.prototype, "setValueAtTime");
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stub(), { voices: 2, preset: "Pad" });

    synth.start({ note: 60, time: 1 });
    await synth.ready;

    const cutoff = synth.params.cutoff as unknown as AudioParamMock;
    const gate = synth.voices[0].gate as unknown as AudioParamMock;
    const written = spy.mock.instances;
    expect(written.indexOf(cutoff)).toBeGreaterThanOrEqual(0);
    expect(written.indexOf(cutoff)).toBeLessThan(written.indexOf(gate));
    expect(cutoff.events).toEqual([
      { method: "setValueAtTime", value: 600, time: 0 },
    ]);
    spy.mockRestore();
  });

  it("queues a setPreset that arrives before ready", async () => {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stub(), { voices: 2 });

    synth.setPreset("Brass", { time: 3 });
    expect(() => synth.setPreset("Nope")).toThrow(/Unknown preset "Nope"/);
    await synth.ready;

    expect(synth.params.cutoff).toBeDefined();
    expect(events(synth.params.cutoff)).toEqual([
      { method: "setValueAtTime", value: 3000, time: 3 },
    ]);
  });

  it("keeps a queued preset when a queued note is stopped", async () => {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stub(), { voices: 2 });

    synth.setPreset("Brass");
    synth.start({ note: 60, time: 4 });
    synth.stop();
    await synth.ready;

    expect(events(synth.params.cutoff).length).toBe(1);
    expect(events(synth.voices[0].gate)).toEqual([]);
  });

  it("lists the bank's names, and nothing without a bank", async () => {
    const { synth } = await built();
    const { context } = createAudioContextMock();

    expect(synth.presets).toEqual(["Brass", "Pad"]);
    expect(
      Instrument(context, { ...stub(), presets: undefined }).presets,
    ).toEqual([]);
  });

  it("type-checks a factory bank against the definition's own params", () => {
    const good: VoiceDefinition<Keys, Voice> = stub();
    expect(good.presets!.Brass).toEqual({ cutoff: 3000, resonance: 0.8 });

    const bad: VoiceDefinition<Keys, Voice> = {
      ...stub(),
      presets: {
        // @ts-expect-error a misspelt key is a build error, not a runtime one
        Typo: { cutof: 3000 },
      },
    };
    expect(bad.presets!.Typo).toBeDefined();
  });
});
