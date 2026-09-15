import * as webAudio from "node-web-audio-api";
import { describe, expect, it } from "vitest";
import playgroundPatch from "../patches/playground";
import {
  GALLERY_PRESET_NAMES,
  LESSON_PRESET_NAMES,
  learnVoiceParams,
  padMapping,
  presets,
  type LearnVoiceParam,
} from "../voice";
import { padHome, padValues } from "./pad";
import { changedParams, VOICE_RANGE } from "./state";
import { PLAYGROUND_PARAMS, presetValues } from "./values";

/*
 * The Playground's own two promises.
 *
 * 1. It resolves a preset to the same thirty-one numbers the library does. It
 *    has to do the resolving itself - `setPreset` schedules, and a slider has to
 *    move now - and two resolvers that disagree would be a page whose knobs lie
 *    about the sound coming out of it.
 * 2. The link is small, and it round-trips.
 *
 * It also writes no colour, but that is not checked here: rule 4 walks
 * `learn/playground` like every other design directory (06b), so the copy of
 * its patterns that used to live at the bottom of this file is gone.
 */

// ---------------------------------------------------------------------------
// The preset resolver
// ---------------------------------------------------------------------------

for (const [name, value] of Object.entries(webAudio)) {
  if (name === "default" || name === "__esModule") continue;
  if (name === "mediaDevices") continue;
  (globalThis as Record<string, unknown>)[name] = value;
}

const SAMPLE_RATE = 48000;
const TIMEOUT = 120_000;

/** Build the patch with a preset and let the instrument actually apply it. */
async function loaded(preset?: string) {
  const context = new OfflineAudioContext(
    1,
    SAMPLE_RATE / 10,
    SAMPLE_RATE,
  ) as unknown as AudioContext;
  const synth = playgroundPatch.build(context, { voices: 1, preset });
  await (synth as unknown as { ready: Promise<void> }).ready;
  // `setPreset` schedules with `setValueAtTime`, and a scheduled value reaches
  // `[[current value]]` at the start of a render quantum - so the parameters are
  // read after one has been rendered, which is the only honest way to ask.
  await (context as unknown as OfflineAudioContext).startRendering();
  return synth;
}

describe("a preset resolves to the same sound the library loads", () => {
  const everyPreset = [...LESSON_PRESET_NAMES, ...GALLERY_PRESET_NAMES];

  it("names a preset bank that has not moved under it", () => {
    expect(everyPreset.length).toBe(Object.keys(presets).length);
    expect(PLAYGROUND_PARAMS).toHaveLength(31);
  });

  it(
    "agrees with the instrument for every sound in both banks",
    async () => {
      const violations: string[] = [];

      for (const name of [undefined, ...everyPreset]) {
        const synth = await loaded(name);
        const { values, glide } = presetValues(name);

        for (const param of PLAYGROUND_PARAMS) {
          const live = synth.voice.params[param].value;
          const ours = values[param];
          // `AudioParam` holds a float32; a preset writes a double.
          if (Math.abs(live - ours) > Math.max(Math.abs(ours), 1) * 1e-5) {
            violations.push(
              `${name ?? "Init"}: ${param} is ${live}, we said ${ours}`,
            );
          }
        }

        if (synth.glide.value !== glide) {
          violations.push(
            `${name ?? "Init"}: glide is ${synth.glide.value}, we said ${glide}`,
          );
        }
        synth.dispose();
      }

      expect(violations).toEqual([]);
    },
    TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// The link
// ---------------------------------------------------------------------------

describe("only the departures travel", () => {
  const base = presetValues("bass").values;

  it("says nothing about a sound nobody touched", () => {
    expect(changedParams({ ...base }, base)).toEqual({});
  });

  it("names the one knob that moved", () => {
    expect(changedParams({ ...base, cutoff: 900 }, base)).toEqual({
      cutoff: 900,
    });
  });

  it("forgives a float that has been through JSON", () => {
    const shaken = { ...base, resonance: base.resonance + 1e-15 };
    expect(changedParams(shaken, base)).toEqual({});
  });

  it("keeps a parameter the sound it names has never heard of", () => {
    expect(changedParams({ somethingNew: 3 }, base)).toEqual({
      somethingNew: 3,
    });
  });
});

describe("the pool a link may ask for", () => {
  it("is the range the patch's own control declares", () => {
    const voices = playgroundPatch.controls.find((c) => c.id === "voices")!;
    if (voices.kind !== "slider") throw Error("voices is not a slider");
    expect({ min: voices.min, max: voices.max }).toEqual(VOICE_RANGE);
  });
});

// ---------------------------------------------------------------------------
// The pad
// ---------------------------------------------------------------------------

describe("the pad arrives where the sound already is", () => {
  it("puts the dot on the first binding of each axis", () => {
    for (const name of GALLERY_PRESET_NAMES) {
      const { values } = presetValues(name);
      const mapping = padMapping(name);
      const home = padHome(mapping, values);

      for (const [axis, position] of [
        [mapping.x, home[0]],
        [mapping.y, home[1]],
      ] as const) {
        expect(position, name).toBeGreaterThanOrEqual(0);
        expect(position, name).toBeLessThanOrEqual(1);
        const binding = axis.bind[0];
        const back = padValues(mapping, home)[binding.param]!;
        const wanted = Math.min(
          Math.max(values[binding.param], Math.min(binding.min, binding.max)),
          Math.max(binding.min, binding.max),
        );
        expect(back, `${name}/${binding.param}`).toBeCloseTo(wanted, 5);
      }
    }
  });

  it("moves every parameter an axis is bound to", () => {
    const mapping = padMapping("two-sounds-in-one");
    const moved = padValues(mapping, [1, 1]);
    expect(Object.keys(moved).sort()).toEqual(
      ["lfoRate", "pulseWidth", "resonance", "filterLfo"].sort(),
    );
    for (const [param, value] of Object.entries(moved)) {
      const spec = learnVoiceParams[param as LearnVoiceParam];
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
  });
});
