import * as webAudio from "node-web-audio-api";
import { describe, expect, it } from "vitest";
import {
  FILTER_TYPE_NAMES,
  LEARN_VOICE_GROUPS,
  learnVoiceParams,
  LFO_SHAPE_NAMES,
  WAVEFORM_NAMES,
  type LearnVoiceParam,
} from "../voice";
import voice, { controlLabel, controlScale } from "./voice";

/*
 * The derivation, checked against the table it was derived from.
 *
 * `learn/voice/README.md` states the contract twice on purpose: as a rule the
 * patch can run, and as a table of all thirty-one results, with the table
 * winning if the two ever disagree. This file is where they are made to agree -
 * the labels below are transcribed from that table, so a change to the rule
 * that moves one of them fails here and names it.
 */

const EXPECTED_LABELS: Record<LearnVoiceParam, string> = {
  // Oscillators
  sawLevel: "Saw level",
  pulseLevel: "Pulse level",
  pulseWidth: "Pulse width",
  pulseWidthLfo: "PWM depth",
  pulseWidthEnv: "PW envelope",
  noiseLevel: "Noise level",
  detuneCoarse: "Coarse detune",
  detuneFine: "Fine detune",
  waveform: "Waveform",
  // Pitch
  pitchEnv: "Pitch envelope",
  pitchLfo: "Pitch LFO",
  bend: "Bend",
  // Filter
  cutoff: "Cutoff",
  resonance: "Resonance",
  filterEnv: "Filter envelope",
  filterLfo: "Filter LFO",
  keyTrack: "Key tracking",
  filterType: "Filter type",
  // Envelopes
  attack: "Attack",
  decay: "Decay",
  sustain: "Sustain",
  release: "Release",
  modAttack: "Modulation attack",
  modDecay: "Modulation decay",
  modSustain: "Modulation sustain",
  modRelease: "Modulation release",
  // LFO
  lfoShape: "LFO shape",
  lfoRate: "LFO rate",
  lfoDelay: "LFO delay",
  tremolo: "Tremolo",
  lfoRateEnv: "LFO rate envelope",
};

const names = Object.keys(learnVoiceParams) as LearnVoiceParam[];
const byId = new Map(voice.controls.map((control) => [control.id, control]));

describe("one control per parameter", () => {
  it("has all thirty-one, plus the two that are not parameters", () => {
    expect(names).toHaveLength(31);
    expect(voice.controls).toHaveLength(33);
    expect(byId.has("glide")).toBe(true);
    expect(byId.has("keyboard")).toBe(true);
  });

  it("names each control after its parameter, so a lesson can show it", () => {
    for (const name of names) expect(byId.get(name)?.id).toBe(name);
  });

  it("lays them out in the Playground's group order", () => {
    const grouped = Object.values(LEARN_VOICE_GROUPS).flatMap((group) => [
      ...group,
    ]);
    expect(voice.controls.slice(0, 31).map((c) => c.id)).toEqual(grouped);
  });
});

describe("the labels", () => {
  it("match the README's table for all thirty-one", () => {
    for (const name of names) {
      expect(byId.get(name)?.label).toBe(EXPECTED_LABELS[name]);
    }
  });

  it("expands the three abbreviations the rule names", () => {
    expect(controlLabel("lfoRateEnv")).toBe("LFO rate envelope");
    expect(controlLabel("modAttack")).toBe("Modulation attack");
    expect(controlLabel("pitchEnv")).toBe("Pitch envelope");
  });
});

describe("the tapers", () => {
  it("gives log to the two that span two decades, and to nothing else", () => {
    const log = voice.controls
      .filter((c) => c.kind === "slider" && c.scale === "log")
      .map((c) => c.id);
    expect(log).toEqual(["cutoff", "lfoRate"]);
  });

  it("gives time to every duration, because none of them can be log", () => {
    for (const name of names) {
      if (learnVoiceParams[name].unit !== "s") continue;
      const control = byId.get(name);
      expect(control?.kind === "slider" && control.scale).toBe("time");
      // A `time` taper exists because these start at 0 and 0 has no logarithm.
      expect(learnVoiceParams[name].min).toBe(0);
    }
  });

  it("leaves everything else linear", () => {
    for (const name of names) {
      const spec = learnVoiceParams[name];
      if (spec.unit === "index" || spec.unit === "s") continue;
      if (spec.min > 0 && spec.max / spec.min >= 100) continue;
      const control = byId.get(name);
      expect(control?.kind === "slider" && control.scale).toBe("lin");
    }
  });

  it("is the rule, not a list", () => {
    expect(controlScale({ min: 20, max: 12000, unit: "Hz" })).toBe("log");
    expect(controlScale({ min: 0, max: 5000, unit: "Hz" })).toBe("lin");
    expect(controlScale({ min: 0, max: 10, unit: "s" })).toBe("time");
    expect(controlScale({ min: 0, max: 4, unit: "index" })).toBeUndefined();
  });
});

describe("the three index parameters", () => {
  const OPTIONS: Partial<Record<LearnVoiceParam, readonly string[]>> = {
    waveform: WAVEFORM_NAMES,
    filterType: FILTER_TYPE_NAMES,
    lfoShape: LFO_SHAPE_NAMES,
  };

  it("are the selects, and the only ones", () => {
    const selects = voice.controls
      .filter((control) => control.kind === "select")
      .map((control) => control.id);
    expect(selects).toEqual(["waveform", "filterType", "lfoShape"]);
  });

  it("offer one name per value, in index order", () => {
    for (const [name, options] of Object.entries(OPTIONS)) {
      const spec = learnVoiceParams[name as LearnVoiceParam];
      const control = byId.get(name);
      expect(control?.kind === "select" && control.options).toEqual([
        ...options!,
      ]);
      // `INDEX_OPTIONS[name][value - min]` is the label, and every one of the
      // three starts at 0, which is why the index *is* the value.
      expect(spec.min).toBe(0);
      expect(options!.length).toBe(spec.max - spec.min + 1);
    }
  });
});

describe("the ranges and the defaults", () => {
  it("are the spec's, never retyped", () => {
    for (const name of names) {
      const spec = learnVoiceParams[name];
      const control = byId.get(name)!;
      expect(control.kind === "select" || control.kind === "slider").toBe(true);
      if (control.kind === "slider") {
        expect(control.min).toBe(spec.min);
        expect(control.max).toBe(spec.max);
        expect(control.unit).toBe(spec.unit);
      }
      expect((control as { default?: number }).default).toBe(spec.default);
    }
  });
});

describe("the views", () => {
  it("are the four the README declares", () => {
    expect(voice.views.map((view) => view.kind)).toEqual([
      "keyboard",
      "meter",
      "scope",
      "spectrum",
    ]);
  });

  it("keep the keys out of reach of a lesson's show", () => {
    // The whole reason the keyboard is a view as well as a control: a lesson
    // that shows one knob is still a lesson someone can play.
    expect(voice.views[0].kind).toBe("keyboard");
  });
});

/*
 * And the same patch, built and rendered.
 *
 * The derivation above is arithmetic on an object; this is the half that can
 * only be answered by making a sound. Two things go wrong with a patch built on
 * `Instrument` and nothing else does: an accessor that names a parameter the
 * fan-out does not have - `synth.instrument.params.cutof` - which reads
 * `undefined` and moves nothing, and a widget that arrives audible. Both are
 * invisible until a reader meets them, so they are rendered here, offline,
 * through `node-web-audio-api`, the harness `learn/voice/learn-voice.test.ts`
 * and `packages/synthlet/src/offline.test.ts` both use.
 */

for (const [name, value] of Object.entries(webAudio)) {
  if (name === "default" || name === "__esModule") continue;
  if (name === "mediaDevices") continue;
  (globalThis as Record<string, unknown>)[name] = value;
}

const SAMPLE_RATE = 48000;
const TIMEOUT = 60_000;

/** Peak magnitude of the whole render. */
function peak(samples: Float32Array): number {
  let loudest = 0;
  for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
  return loudest;
}

async function buildOffline(seconds: number, preset?: string) {
  const context = new OfflineAudioContext(
    1,
    Math.round(SAMPLE_RATE * seconds),
    SAMPLE_RATE,
  ) as unknown as AudioContext;
  const synth = voice.build(context, { preset, voices: 2 });
  await (synth as unknown as { ready: Promise<void> }).ready;
  return { context, synth };
}

describe("the patch, built", () => {
  it(
    "gives every control something real to move",
    async () => {
      const { synth } = await buildOffline(0.1);

      for (const control of voice.controls) {
        if (control.kind === "keyboard") continue;
        if (control.kind === "slider" || control.kind === "select") {
          const ref = control.param(synth);
          expect(ref, control.id).toBeDefined();
          expect(typeof ref.value, control.id).toBe("number");
        }
      }
    },
    TIMEOUT,
  );

  it(
    "writes what a slider writes",
    async () => {
      const { synth } = await buildOffline(0.1);
      const cutoff = byId.get("cutoff")!;
      if (cutoff.kind !== "slider") throw Error("cutoff is not a slider");

      cutoff.param(synth).value = 400;
      expect(cutoff.param(synth).value).toBeCloseTo(400, 6);

      // `glide` is the one control that is not an `AudioParam` at all, and the
      // kit is not supposed to be able to tell.
      const glide = byId.get("glide")!;
      if (glide.kind !== "slider") throw Error("glide is not a slider");
      glide.param(synth).value = 0.25;
      expect(synth.instrument.glide).toBe(0.25);
    },
    TIMEOUT,
  );

  it(
    "arrives silent, and sounds when the gate is opened",
    async () => {
      const { context, synth } = await buildOffline(0.6, "Init");
      synth.connect(context.destination);

      // The compound *is* its output gain, and the kit's Play toggle is the
      // only thing that opens it.
      expect(synth.gain.value).toBe(0);
      synth.instrument.start({ note: "C4", velocity: 100, time: 0 });

      const silent = peak(
        Float32Array.from(
          (
            await (context as unknown as OfflineAudioContext).startRendering()
          ).getChannelData(0),
        ),
      );
      expect(silent).toBeLessThan(1e-6);
    },
    TIMEOUT,
  );

  it(
    "makes a sound once the gain is open",
    async () => {
      const { context, synth } = await buildOffline(0.6, "Init");
      synth.connect(context.destination);
      synth.gain.value = 1;
      synth.instrument.start({ note: "C4", velocity: 100, time: 0 });

      const sound = peak(
        Float32Array.from(
          (
            await (context as unknown as OfflineAudioContext).startRendering()
          ).getChannelData(0),
        ),
      );
      expect(sound).toBeGreaterThan(0.05);
    },
    TIMEOUT,
  );
});
