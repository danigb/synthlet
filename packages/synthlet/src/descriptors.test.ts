import * as synthlet from "./index";
import type { ParamDescriptor } from "./_worklet";
import {
  AnalogDelayMode,
  ArpMode,
  ArpOctaveMode,
  ArpScale,
  ClipType,
  LfoType,
  NoiseType,
  ParamScaleType,
  PolyblepOscillatorType,
  RingModType,
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
  "AnalogDelay",
  "Arp",
  "BiquadFilter",
  "Chorus",
  "ClipAmp",
  "Clock",
  "DattorroReverb",
  "DigitalDelay",
  "Euclid",
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
  "RingMod",
  "Svf",
  "TimestretchAudioSource",
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
  // The **rate** is not part of the contract, and the list below is where each
  // module's answer is recorded. Every param here that places an *event* is
  // a-rate as of automation-rate ticket 03: a gate scheduled at an exact sample
  // takes effect at that sample rather than at the top of the next 128-frame
  // quantum - up to 2.9 ms late at 44.1 kHz, and by a different amount for
  // every event, so a repeated pattern did not even swing consistently. The two
  // `sync` params were already there, because hard sync has to place a reset
  // *inside* a sample and quantising it costs 20 dB of alias rejection.
  //
  // **`Granite.freeze` is the one k-rate entry, and it is not an event.** It
  // borrows the gate's shape - `> 0`, so a scaled control still opens it - to
  // latch a *mode*: the write head stops, and `dsp.ts` crossfades 100 samples
  // across each edge precisely because the splice, not the sample the edge
  // landed on, is what a listener hears. Placing that edge to the sample would
  // buy nothing the fade does not already cover.
  //
  // So the rule this list pins is "an event param is a-rate", and a new module
  // declaring a k-rate trigger fails here rather than shipping a quantised one.
  it("declares every trigger-like param the same way", () => {
    const TRIGGERS: [string, string, ParamDescriptor["automationRate"]][] = [
      ["AdAmp", "trigger", "a-rate"],
      ["AdEnv", "trigger", "a-rate"],
      ["AdsrAmp", "gate", "a-rate"],
      ["AdsrEnv", "gate", "a-rate"],
      ["Arp", "trigger", "a-rate"],
      ["Granite", "freeze", "k-rate"],
      ["Impulse", "trigger", "a-rate"],
      ["KarplusStrong", "trigger", "a-rate"],
      // The first modulation source on the list. Its a-rate ground is reach
      // rather than jitter - 2.9 ms is nothing against a 5 Hz cycle - but the
      // shape is the same one, so `clock.gate`, an `AdEnv` or a `Param` all
      // drive it.
      ["Lfo", "sync", "a-rate"],
      // And its second: `gate` drives the depth envelope. Two event params on
      // one module, deliberately - `sync` resets the phase, `gate` restarts the
      // depth ramp, and delayed vibrato on a free-running LFO needs both to be
      // separately reachable.
      ["Lfo", "gate", "a-rate"],
      ["PolyblepOscillator", "sync", "a-rate"],
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

  it("keeps Svf's frequency and Q at a-rate", () => {
    // `Q` joined `frequency` when the state variable filter's resonance went
    // a-rate: it opens with the envelope and tracks velocity, the same argument
    // `virtual-analog-filter` made for `resonance`. `type` stays k-rate - it is
    // an index into a set of output mixes, not a point on a continuum.
    const aRate = synthlet.Svf.descriptors.filter(
      (d) => d.automationRate === "a-rate",
    );
    expect(aRate.map((d) => d.name)).toEqual(["frequency", "Q"]);
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
  // Four packages compute the same expression - `x * gain + offset` - and a
  // caller moving a patch between them should not have to look up two different
  // ranges. `lfo` was the odd one out at `gain: [0, 10000]`, which forbade a
  // negative depth: there was no way to invert an LFO, and inverted modulation
  // is ordinary.
  it("agrees on the depth range across every x * gain + offset module", () => {
    const range = (factory: Factory, name: string) => {
      const descriptor = factory.descriptors.find((d) => d.name === name);
      return [descriptor?.minValue, descriptor?.maxValue];
    };

    for (const factory of [
      synthlet.AdEnv,
      synthlet.AdsrEnv,
      synthlet.Param,
      synthlet.Lfo,
    ]) {
      expect(range(factory, "gain")).toEqual([-20000, 20000]);
      expect(range(factory, "offset")).toEqual([-20000, 20000]);
    }
  });

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
    name: "AnalogDelay.mode",
    values: AnalogDelayMode,
    factory: synthlet.AnalogDelay,
    param: "mode",
  },
  {
    name: "Noise.type",
    values: NoiseType,
    factory: synthlet.Noise,
    param: "type",
  },
  { name: "Lfo.type", values: LfoType, factory: synthlet.Lfo, param: "type" },
  { name: "Arp.mode", values: ArpMode, factory: synthlet.Arp, param: "mode" },
  {
    name: "Arp.octaveMode",
    values: ArpOctaveMode,
    factory: synthlet.Arp,
    param: "octaveMode",
  },
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
    // One member, so it spans 0...0 - which is the point: the diode ring
    // (Parker, DAFx-11) is a different function rather than a further point
    // on a continuum, and this is the seam it lands on.
    name: "RingMod.type",
    values: RingModType,
    factory: synthlet.RingMod,
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
  AnalogDelayMode,
  ArpMode,
  ArpOctaveMode,
  ArpScale,
  ClipType,
  LfoType,
  NoiseType,
  ParamScaleType,
  PolyblepOscillatorType,
  RingModType,
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
