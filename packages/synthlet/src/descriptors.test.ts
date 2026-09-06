import * as synthlet from "./index";
import type { ParamDescriptor } from "./_worklet";
import {
  ArpScale,
  ClipType,
  LfoType,
  NoiseType,
  ParamScaleType,
  PolyblepOscillatorType,
  SvfType,
} from "./index";

// Every module factory carries the parameter list its processor registered.
// This test is the thing that keeps the two in step: a package that forgets to
// attach `descriptors`, or attaches a list with a bad range, fails here.

type Factory = { descriptors: readonly ParamDescriptor[] };

const EXPECTED = [
  "AdAmp",
  "AdEnv",
  "AdsrAmp",
  "AdsrEnv",
  "Arp",
  "BiquadFilter",
  "Chorus",
  "ClipAmp",
  "Clock",
  "DattorroReverb",
  "DigitalDelay",
  "Euclid",
  "FlexAudioBufferSource",
  "Gain",
  "Granite",
  "Impulse",
  "KarplusStrong",
  "LevelMeter",
  "Lfo",
  "LookaheadLimiter",
  "Noise",
  "Oscillator",
  "Param",
  "PolyblepOscillator",
  "ReverbDelay",
  "Svf",
  "VirtualAnalogFilter",
  "WavetableOscillator",
];

const withDescriptors = Object.entries(synthlet as Record<string, unknown>)
  .filter(
    (entry): entry is [string, Factory] =>
      typeof entry[1] === "function" && "descriptors" in entry[1],
  )
  .sort(([a], [b]) => a.localeCompare(b));

describe("descriptors", () => {
  it("every module factory exposes them", () => {
    expect(withDescriptors.map(([name]) => name)).toEqual(EXPECTED);
  });

  it("LevelMeter, the one parameterless module, exposes an empty list", () => {
    expect(synthlet.LevelMeter.descriptors).toEqual([]);
  });

  it("LookaheadLimiter exposes its three performance parameters", () => {
    expect(synthlet.LookaheadLimiter.descriptors.map((d) => d.name)).toEqual([
      "threshold",
      "release",
      "gain",
    ]);
  });

  // One gate/trigger contract means one shape for the param that carries it:
  // if these drifted apart, the same signal would drive some modules and not
  // others - which is exactly the bug the shared detector removed.
  //
  // The rate is the one thing that is *not* part of the contract, so it is a
  // column rather than a constant. Every gate in the library only has to decide
  // which block it fired in, and is k-rate; `WavetableOscillator`'s `sync` has
  // to decide where inside a *sample*, because a reset quantised to a render
  // quantum is 2.9 ms of jitter at 44.1 kHz and costs 20 dB of alias rejection.
  it("declares every trigger-like param the same way", () => {
    const TRIGGERS: [string, string, AutomationRate][] = [
      ["AdAmp", "trigger", "k-rate"],
      ["AdEnv", "trigger", "k-rate"],
      ["AdsrAmp", "gate", "k-rate"],
      ["AdsrEnv", "gate", "k-rate"],
      ["Arp", "trigger", "k-rate"],
      ["Impulse", "trigger", "k-rate"],
      ["KarplusStrong", "trigger", "k-rate"],
      ["WavetableOscillator", "sync", "a-rate"],
    ];

    for (const [name, param, automationRate] of TRIGGERS) {
      const factory = (synthlet as any)[name] as Factory;
      const descriptor = factory.descriptors.find((d) => d.name === param);
      expect([name, descriptor]).toEqual([
        name,
        {
          name: param,
          defaultValue: 0,
          minValue: 0,
          maxValue: 1,
          automationRate,
        },
      ]);
    }
  });

  it("keeps Svf's frequency at a-rate", () => {
    const aRate = synthlet.Svf.descriptors.filter(
      (d) => d.automationRate === "a-rate",
    );
    expect(aRate.map((d) => d.name)).toEqual(["frequency"]);
  });

  // Scanning a wavetable at audio rate is one of the format's signature sounds,
  // and a k-rate position quantises it to one step per render quantum. It is
  // also normalized 0..1 rather than a plane index, so a modulator patched into
  // it does not have to know the current table's plane count.
  //
  // `frequency` and `detune` joined it at a-rate: all three are one expression,
  // `frequency * 2^(detune/1200) * len / sampleRate`, and a k-rate pitch
  // quantises FM to 2.9 ms at 44.1 kHz, which aliases for any modulator above
  // about 172 Hz.
  it("keeps WavetableOscillator's eight signals at a-rate", () => {
    // Ticket 11's four stochastic barriers and step sizes joined them. They are
    // *read* once per wave cycle, because a bounded random walk is a per-cycle
    // process and sampling its parameters faster would not make it move faster;
    // a-rate is what decides *which* value the boundary gets - the one at its
    // own sample rather than the one at the top of the render quantum. The
    // segment count is the exception and is k-rate: Radna 2.1 makes it
    // "variable at runtime" but it is a structure and not a signal.
    const aRate = synthlet.WavetableOscillator.descriptors.filter(
      (d) => d.automationRate === "a-rate",
    );
    expect(aRate.map((d) => d.name)).toEqual([
      "frequency",
      "detune",
      "morph",
      "sync",
      "pitchChaos",
      "pitchSpread",
      "ampChaos",
      "ampSpread",
    ]);
    expect(aRate[2]).toEqual({
      name: "morph",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automationRate: "a-rate",
    });
  });

  // `AudioParam` sums its inputs with the intrinsic value, so a node connected
  // to a frequency is linear FM by construction - and a range that starts at 0
  // half-wave rectifies the modulator, which does not tame the spectrum, it
  // makes it the spectrum of a *different* modulator. Bipolar is what makes it
  // through-zero: the read pointer runs backwards.
  it("keeps WavetableOscillator's frequency bipolar", () => {
    const frequency = synthlet.WavetableOscillator.descriptors.find(
      (d) => d.name === "frequency",
    );
    expect(frequency).toEqual({
      name: "frequency",
      defaultValue: 440,
      minValue: -20000,
      maxValue: 20000,
      automationRate: "a-rate",
    });
  });

  // Ticket 11's stage is off by default and exactly inert when off - the DSP
  // test asserts sample-for-sample identity against the same patch without it -
  // and the property that makes that reachable is that **both barriers default
  // to 0**. Radna 2.3: "reducing both barrier position parameters to zero
  // reproduces the input wavetable at a constant pitch". If a default ever
  // moves, every alias floor this package publishes moves with it.
  //
  // `segments` carries `minValue: 0` where 1 would be natural, and that is this
  // library's standing decision rather than a slip: `connectParams` writes
  // `param.value = 0` for every connected input, so a positive minimum makes
  // Chrome clamp that write and warn. 0 and 1 are both one segment in the DSP.
  it("keeps WavetableOscillator's stochastic mode off by default", () => {
    const byName = Object.fromEntries(
      synthlet.WavetableOscillator.descriptors.map((d) => [d.name, d]),
    );
    expect(byName.pitchSpread.defaultValue).toBe(0);
    expect(byName.ampSpread.defaultValue).toBe(0);
    expect(byName.segments).toEqual({
      name: "segments",
      defaultValue: 8,
      minValue: 0,
      maxValue: 256,
      automationRate: "k-rate",
    });
  });
});

describe.each(withDescriptors)("%s.descriptors", (_name, factory) => {
  it("names its parameters exactly once", () => {
    const names = factory.descriptors.map((d) => d.name);
    expect(names).toEqual([...new Set(names)]);
  });

  it("is a well formed descriptor list", () => {
    for (const d of factory.descriptors) {
      expect(typeof d.name).toBe("string");
      expect(d.name).not.toBe("");
      expect(["a-rate", "k-rate"]).toContain(d.automationRate);
      expect(Number.isFinite(d.defaultValue)).toBe(true);
      expect(d.minValue).toBeLessThanOrEqual(d.defaultValue);
      expect(d.defaultValue).toBeLessThanOrEqual(d.maxValue);
    }
  });
});

// An enum-typed parameter must not advertise a value its enum doesn't have: a
// UI reading `maxValue` would offer members that don't exist.
const members = (values: object) =>
  Object.values(values).filter((v): v is number => typeof v === "number");

const ENUM_PARAMS = [
  {
    name: "Noise.type",
    values: NoiseType,
    factory: synthlet.Noise,
    param: "type",
  },
  { name: "Lfo.type", values: LfoType, factory: synthlet.Lfo, param: "type" },
  {
    name: "ClipAmp.type",
    values: ClipType,
    factory: synthlet.ClipAmp,
    param: "type",
  },
  { name: "Svf.type", values: SvfType, factory: synthlet.Svf, param: "type" },
  {
    name: "Param.scale",
    values: ParamScaleType,
    factory: synthlet.Param,
    param: "scale",
  },
  {
    name: "PolyblepOscillator.type",
    values: PolyblepOscillatorType,
    factory: synthlet.PolyblepOscillator,
    param: "type",
  },
  {
    // Its types are a const object attached to the factory, not an enum.
    name: "VirtualAnalogFilter.type",
    values: synthlet.VirtualAnalogFilter,
    factory: synthlet.VirtualAnalogFilter,
    param: "type",
  },
];

describe.each(ENUM_PARAMS)("$name", ({ values, factory, param }) => {
  it("spans exactly its enum", () => {
    const descriptor = factory.descriptors.find((d) => d.name === param);
    expect(descriptor).toBeDefined();
    expect(descriptor!.minValue).toBe(Math.min(...members(values)));
    expect(descriptor!.maxValue).toBe(Math.max(...members(values)));
  });
});

// The umbrella names every enum in an explicit re-export, because tsup's dts
// bundler drops enums from `export *`: without those lines they exist at
// runtime but not in the published declarations. The declaration itself is
// checked at build time; this is the cheap runtime half, and fails if a name
// stops being exported at all.
const ENUMS = {
  ArpScale,
  ClipType,
  LfoType,
  NoiseType,
  ParamScaleType,
  PolyblepOscillatorType,
  SvfType,
};

describe.each(Object.entries(ENUMS))("%s", (name, values) => {
  it("is exported by the umbrella", () => {
    expect(Object.keys(synthlet)).toContain(name);
    expect((synthlet as Record<string, unknown>)[name]).toBe(values);
  });

  it("is an enum: every member is a number its name maps back from", () => {
    const map = values as unknown as Record<string, string | number>;
    const named = Object.keys(map).filter((key) => isNaN(Number(key)));

    expect(named.length).toBeGreaterThan(0);
    for (const member of named) {
      const value = map[member];
      expect(typeof value).toBe("number");
      expect(map[String(value)]).toBe(member);
    }
  });
});
