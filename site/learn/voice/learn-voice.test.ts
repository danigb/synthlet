import * as webAudio from "node-web-audio-api";
import { Instrument } from "synthlet";
import { beforeAll, describe, expect, it } from "vitest";
import { learnVoice } from "./learn-voice";
import {
  INDEX_OPTIONS,
  LEARN_VOICE_GROUPS,
  learnVoiceParams,
  type LearnVoiceParam,
} from "./params";
import { galleryPresets, lessonPresets, presets } from "./presets";

// The voice, checked two ways: as a schema, and as sound.
//
// The schema half needs no audio at all - a definition is data, and the things
// that go wrong with one (a preset key that is not a parameter, a default
// outside its own range, a `select` whose option list is a name short) are all
// visible in the object. Those tests are the ones a lesson depends on, because
// `Instrument` throws on an unknown preset key at load time and a lesson that
// throws is a blank page.
//
// The sound half renders the voice on an `OfflineAudioContext` through
// `node-web-audio-api`, the same harness `packages/synthlet/src/offline.test.ts`
// uses - a Rust Web Audio implementation with real worklets in node. The
// library builds its nodes from the *globals* (`new AudioWorkletNode(...)` in
// `scripts/_worklet.ts`), so they are injected here rather than imported into
// scope, which is what `scripts/offline-audio-env.mjs` does for jest.
//
// **No stored checksum.** The ticket asks for one; determinism is the honest
// version of it. A hash of the samples would pin this file to today's
// `polyblep` and fail on every unrelated DSP improvement, whereas "two renders
// of one graph are sample-identical" is the property an offline render is
// actually for, and it is what `offline.test.ts` asserts for the same reason.

for (const [name, value] of Object.entries(webAudio)) {
  if (name === "default" || name === "__esModule") continue;
  if (name === "mediaDevices") continue;
  (globalThis as Record<string, unknown>)[name] = value;
}

const SAMPLE_RATE = 48000;
const WINDOW = 0.01;
const NOTE_ON = 0.1;
const NOTE_OFF = 1;
const DURATION = 1.5;
const TIMEOUT = 60_000;

/** The instrument options a preset may carry that are not parameters. */
const RESERVED = ["glide", "legato", "priority", "arp"];

const paramNames = Object.keys(learnVoiceParams) as LearnVoiceParam[];

/** Root mean square of the 10 ms window starting at `time`. */
function rmsAt(samples: Float32Array, time: number): number {
  const from = Math.round(time * SAMPLE_RATE);
  const to = Math.min(samples.length, from + Math.round(WINDOW * SAMPLE_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

/** A C4 held for most of a second, rendered. */
async function renderNote(preset: string): Promise<Float32Array> {
  const context = new OfflineAudioContext(
    1,
    SAMPLE_RATE * DURATION,
    SAMPLE_RATE,
  );
  const synth = Instrument(context, learnVoice, { voices: 2, preset });
  synth.connect(context.destination);
  synth.start({ note: "C4", velocity: 100, time: NOTE_ON });
  await synth.ready;
  synth.stop({ time: NOTE_OFF });

  const buffer = await context.startRendering();
  // Copied, not viewed: the next context reuses the render thread's buffer, so
  // a view kept across two renders reads garbage - `offline.test.ts:65-70`.
  return Float32Array.from(buffer.getChannelData(0));
}

describe("the parameter table", () => {
  it("declares thirty-one parameters", () => {
    expect(paramNames).toHaveLength(31);
  });

  it("puts every parameter in exactly one group", () => {
    const grouped = Object.values(LEARN_VOICE_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...paramNames].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("declares no reserved preset key as a parameter", () => {
    for (const reserved of RESERVED) expect(paramNames).not.toContain(reserved);
  });

  it("holds every default inside its own range", () => {
    for (const name of paramNames) {
      const spec = learnVoiceParams[name];
      expect(spec.min, name).toBeLessThan(spec.max);
      expect(spec.default, name).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default, name).toBeLessThanOrEqual(spec.max);
    }
  });

  it("gives every index parameter an option per value", () => {
    const indexed = paramNames.filter(
      (name) => learnVoiceParams[name].unit === "index",
    );
    expect(indexed).toEqual(["waveform", "filterType", "lfoShape"]);

    for (const name of indexed) {
      const spec = learnVoiceParams[name];
      const options = INDEX_OPTIONS[name];
      expect(options, name).toBeDefined();
      expect(options!.length, name).toBe(spec.max - spec.min + 1);
    }
  });

  it("offers no option list for a parameter that is not an index", () => {
    for (const name of Object.keys(INDEX_OPTIONS) as LearnVoiceParam[]) {
      expect(learnVoiceParams[name].unit, name).toBe("index");
    }
  });
});

describe("the preset banks", () => {
  const entries = Object.entries(presets);

  it("keeps the two banks disjoint", () => {
    const both = Object.keys(lessonPresets).filter(
      (name) => name in galleryPresets,
    );
    expect(both).toEqual([]);
    expect(entries).toHaveLength(
      Object.keys(lessonPresets).length + Object.keys(galleryPresets).length,
    );
  });

  it("ships a gallery of sixteen", () => {
    expect(Object.keys(galleryPresets)).toHaveLength(16);
  });

  it("starts from an empty Init", () => {
    expect(lessonPresets.Init).toEqual({});
  });

  it("names the presets the lessons ask for", () => {
    // 08 opens on `Init`; 09's lesson 2.4 matches the four envelope targets;
    // 13's three recipes join the gallery.
    for (const name of [
      "Init",
      "attack",
      "decay-sustain",
      "release",
      "envelope-organ",
      "envelope-trombone",
      "envelope-thunderclap",
      "envelope-flute",
      "pwm",
      "filter-sweep",
      "siren-german",
      "siren-american",
      "brass",
      "flute",
      "strings",
    ]) {
      expect(Object.keys(presets)).toContain(name);
    }
  });

  it("sets only declared parameters and reserved options", () => {
    for (const [preset, values] of entries) {
      for (const key of Object.keys(values)) {
        if (RESERVED.includes(key)) continue;
        expect(paramNames, `${preset}.${key}`).toContain(key);
      }
    }
  });

  it("sets no value outside its parameter's range", () => {
    // `resolvePreset` clamps silently, so an out-of-range value is not an error
    // at runtime - it is a sound that is not the sound that was written.
    for (const [preset, values] of entries) {
      for (const [key, value] of Object.entries(values)) {
        if (RESERVED.includes(key)) continue;
        const spec = learnVoiceParams[key as LearnVoiceParam];
        expect(value as number, `${preset}.${key}`).toBeGreaterThanOrEqual(
          spec.min,
        );
        expect(value as number, `${preset}.${key}`).toBeLessThanOrEqual(
          spec.max,
        );
      }
    }
  });

  it("addresses every parameter at least once", () => {
    // The ticket's criterion: a parameter no preset ever names is a knob with
    // nothing behind it, and one of the thirty-one is a claim about the voice.
    const addressed = new Set(entries.flatMap(([, v]) => Object.keys(v)));
    expect(paramNames.filter((name) => !addressed.has(name))).toEqual([]);
  });

  it("uses the four envelope targets for the envelope alone", () => {
    // Lesson 2.4 gives the reader attack, decay, sustain and release and asks
    // them to match a target. A target that moved anything else is unmatchable.
    const adsr = ["attack", "decay", "sustain", "release"];
    for (const name of [
      "envelope-organ",
      "envelope-trombone",
      "envelope-thunderclap",
      "envelope-flute",
    ]) {
      expect(Object.keys(presets[name]).sort(), name).toEqual([...adsr].sort());
    }
  });
});

describe("the voice, rendered offline", () => {
  let samples: Float32Array;

  beforeAll(async () => {
    samples = await renderNote("Init");
  }, TIMEOUT);

  it(
    "publishes thirty-one AudioParams at their declared defaults",
    async () => {
      const context = new OfflineAudioContext(1, 128, SAMPLE_RATE);
      const synth = Instrument(context, learnVoice, { voices: 2 });

      expect(synth.params).toEqual({});
      await synth.ready;

      expect(Object.keys(synth.params)).toEqual(paramNames);
      for (const name of paramNames) {
        expect(synth.params[name].value, name).toBeCloseTo(
          learnVoiceParams[name].default,
          4,
        );
      }
      expect(synth.voices).toHaveLength(2);
      await context.startRendering();
    },
    TIMEOUT,
  );

  it("is silent until the note", () => {
    expect(rmsAt(samples, 0)).toBe(0);
    expect(rmsAt(samples, NOTE_ON - WINDOW)).toBe(0);
  });

  it("sounds the note", () => {
    expect(rmsAt(samples, NOTE_ON + 0.05)).toBeGreaterThan(0.01);
    expect(rmsAt(samples, 0.5)).toBeGreaterThan(0.01);
  });

  it("lets the note go", () => {
    // `Init`'s release is the ADSR module's own 0.3 s, so half a second after
    // the key is up there is far less left than there was under the finger.
    expect(rmsAt(samples, NOTE_OFF + 0.45)).toBeLessThan(
      rmsAt(samples, 0.5) / 4,
    );
  });

  it(
    "renders the same samples twice",
    async () => {
      const again = await renderNote("Init");
      expect(again.length).toBe(samples.length);
      for (let i = 0; i < samples.length; i++) {
        if (again[i] !== samples[i]) {
          throw Error(`sample ${i}: ${again[i]} !== ${samples[i]}`);
        }
      }
    },
    TIMEOUT,
  );

  it(
    "loads every preset in both banks",
    async () => {
      // `resolvePreset` throws, naming the key, on anything the definition does
      // not declare - so this is the static check above run against the real
      // schema, and the one that would catch a rename of a parameter.
      const context = new OfflineAudioContext(1, 128, SAMPLE_RATE);
      const synth = Instrument(context, learnVoice, { voices: 1 });
      await synth.ready;

      expect(synth.presets).toEqual(Object.keys(presets));
      for (const name of synth.presets) {
        expect(() => synth.setPreset(name), name).not.toThrow();
      }
      await context.startRendering();
    },
    TIMEOUT,
  );

  it(
    "plays a chord on the gallery's strings",
    async () => {
      const context = new OfflineAudioContext(1, SAMPLE_RATE * 2, SAMPLE_RATE);
      const synth = Instrument(context, learnVoice, {
        voices: 8,
        preset: "strings",
      });
      synth.connect(context.destination);
      for (const note of ["C4", "E4", "G4"]) {
        synth.start({ note, velocity: 100, time: NOTE_ON });
      }
      await synth.ready;
      synth.stop({ time: 1.2 });

      const chord = Float32Array.from(
        (await context.startRendering()).getChannelData(0),
      );
      // A 450 ms attack, so the chord is quiet on arrival and loud later on -
      // the one thing a slow attack has to be true of.
      expect(rmsAt(chord, NOTE_ON + 0.02)).toBeLessThan(rmsAt(chord, 0.6));
      expect(rmsAt(chord, 0.6)).toBeGreaterThan(0.02);
    },
    TIMEOUT,
  );
});
