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

  // One gate/trigger contract means one *shape* for the param that carries it:
  // if the ranges drifted apart, the same signal would drive some modules and
  // not others - which is exactly the bug the shared detector removed.
  //
  // The **rate** is not part of that contract, and each entry declares its own.
  // Every module here but one only has to decide which 128-frame block a
  // trigger fired in, and k-rate says so. `PolyblepOscillator.sync` has to
  // decide where *inside a sample*: it is hard sync, the reset is placed at the
  // interpolated crossing instant, and a value read once per quantum would
  // quantise it to 2.9 ms at 44.1 kHz. That is a per-module decision about
  // resolution, not a weakening of the shared shape - which is why the shape
  // below is still asserted whole.
  it("declares every trigger-like param the same way", () => {
    const TRIGGERS: [string, string, ParamDescriptor["automationRate"]][] = [
      ["AdAmp", "trigger", "k-rate"],
      ["AdEnv", "trigger", "k-rate"],
      ["AdsrAmp", "gate", "k-rate"],
      ["AdsrEnv", "gate", "k-rate"],
      ["Arp", "trigger", "k-rate"],
      ["Impulse", "trigger", "k-rate"],
      ["KarplusStrong", "trigger", "k-rate"],
      ["PolyblepOscillator", "sync", "a-rate"],
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

  it("keeps PolyblepOscillator's frequency, detune, width and sync at a-rate", () => {
    // Everything but `type` is a signal: audio-rate FM, sample-accurate pitch,
    // pulse-width modulation and sub-sample hard sync, instead of the 344.5 Hz
    // control rate one value per render quantum gives. `type` selects a
    // waveform, so it stays k-rate and its changes are scheduled as a step by
    // the DSP.
    const aRate = synthlet.PolyblepOscillator.descriptors.filter(
      (d) => d.automationRate === "a-rate",
    );
    expect(aRate.map((d) => d.name)).toEqual([
      "frequency",
      "detune",
      "width",
      "sync",
    ]);
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
