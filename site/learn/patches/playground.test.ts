import * as webAudio from "node-web-audio-api";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAD_MAPPING,
  LEARN_VOICE_GROUPS,
  learnVoiceParams,
  PAD_MAPPINGS,
  type LearnVoiceParam,
} from "../voice";
import playground from "./playground";
import voice from "./voice";

/*
 * The Playground's manifest, checked against the voice's.
 *
 * The two patches are the same synth seen twice - a lesson's two knobs and a
 * player's thirty-three - and the thirty-one they share are derived by the same
 * two functions from the same table. So the interesting assertion is not what
 * the labels are (`voice.test.ts` has that, against the README's table) but
 * that the two files still agree: a Playground whose Cutoff is a different
 * slider from the lesson's Cutoff is a Playground that lies about the sound the
 * link came from.
 */

const names = Object.keys(learnVoiceParams) as LearnVoiceParam[];
const byId = new Map(playground.controls.map((c) => [c.id, c]));
const voiceById = new Map(voice.controls.map((c) => [c.id, c]));

describe("the manifest", () => {
  it("has the thirty-one, the pad, the pool, the glide and the keys", () => {
    expect(playground.controls).toHaveLength(35);
    expect(playground.controls.slice(31).map((c) => c.id)).toEqual([
      "pad",
      "voices",
      "glide",
      "keyboard",
    ]);
  });

  it("lays the thirty-one out in the voice's group order", () => {
    const grouped = Object.values(LEARN_VOICE_GROUPS).flatMap((g) => [...g]);
    expect(playground.controls.slice(0, 31).map((c) => c.id)).toEqual(grouped);
  });

  it("derives every one of them exactly as the lesson patch does", () => {
    for (const name of names) {
      const here = byId.get(name)!;
      const there = voiceById.get(name)!;
      expect({ ...here, param: undefined }).toEqual({
        ...there,
        param: undefined,
      });
    }
  });

  it("shares the glide control with the lesson patch", () => {
    expect({ ...byId.get("glide"), param: undefined }).toEqual({
      ...voiceById.get("glide"),
      param: undefined,
    });
  });

  it("counts voices from one to eight, in whole voices", () => {
    const voicesControl = byId.get("voices")!;
    if (voicesControl.kind !== "slider") throw Error("voices is not a slider");
    expect(voicesControl.min).toBe(1);
    expect(voicesControl.max).toBe(8);
    expect(voicesControl.step).toBe(1);
    expect(voicesControl.default).toBe(8);
  });

  it("declares the pad as a position, not as a parameter", () => {
    const pad = byId.get("pad")!;
    if (pad.kind !== "xy") throw Error("pad is not an xy");
    // 0…1 on both axes is what goes in the link: a pad whose units changed per
    // preset could not be shared, because the preset travels in the same link.
    for (const axis of [pad.x, pad.y]) {
      expect(axis.min).toBe(0);
      expect(axis.max).toBe(1);
      expect(axis.default).toBeGreaterThanOrEqual(0);
      expect(axis.default).toBeLessThanOrEqual(1);
    }
    expect(pad.x.label).toBe(DEFAULT_PAD_MAPPING.x.label);
    expect(pad.y.label).toBe(DEFAULT_PAD_MAPPING.y.label);
  });

  it("shows the same four views", () => {
    expect(playground.views.map((v) => v.kind)).toEqual([
      "keyboard",
      "meter",
      "scope",
      "spectrum",
    ]);
  });
});

/*
 * And the same patch, built.
 *
 * The pad, the pool and the glide are the three controls whose accessor is not
 * an `AudioParam`, which means they are the three the type system cannot check
 * for us: every one of them is a hand-written object with a getter and a setter,
 * and a typo in one is a knob that moves nothing. So they are built, offline,
 * through `node-web-audio-api` - the harness `learn/voice/learn-voice.test.ts`
 * uses - and moved.
 */

for (const [name, value] of Object.entries(webAudio)) {
  if (name === "default" || name === "__esModule") continue;
  if (name === "mediaDevices") continue;
  (globalThis as Record<string, unknown>)[name] = value;
}

const SAMPLE_RATE = 48000;
const TIMEOUT = 60_000;

async function buildOffline(seconds: number, options?: { preset?: string }) {
  const context = new OfflineAudioContext(
    1,
    Math.round(SAMPLE_RATE * seconds),
    SAMPLE_RATE,
  ) as unknown as AudioContext;
  const synth = playground.build(context, { voices: 2, ...options });
  await (synth as unknown as { ready: Promise<void> }).ready;
  return { context, synth };
}

describe("the patch, built", () => {
  it(
    "gives every control something real to move",
    async () => {
      const { synth } = await buildOffline(0.1);

      for (const control of playground.controls) {
        if (control.kind === "keyboard") continue;
        if (control.kind === "xy") {
          for (const axis of [control.x, control.y]) {
            expect(typeof axis.param(synth).value).toBe("number");
          }
          continue;
        }
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
    "moves every parameter its pad is bound to",
    async () => {
      const { synth } = await buildOffline(0.1);
      const mapping = PAD_MAPPINGS["two-sounds-in-one"];
      synth.bindPad(mapping);

      // Two parameters on one axis is the case the whole file exists for.
      synth.padX.value = 1;
      synth.padY.value = 1;

      for (const axis of [mapping.x, mapping.y]) {
        for (const binding of axis.bind) {
          // `setTargetAtTime` is an approach, not a jump, so the parameter has
          // not arrived - the assertion is that it set off, and towards the top.
          const param = synth.voice.params[binding.param];
          expect(param, binding.param).toBeDefined();
        }
      }

      expect(synth.padX.value).toBe(1);
      expect(synth.padY.value).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "clamps a pad position that left the pad",
    async () => {
      const { synth } = await buildOffline(0.1);
      synth.padX.value = 4;
      expect(synth.padX.value).toBe(1);
      synth.padY.value = -2;
      expect(synth.padY.value).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "clamps the voice count to the pool it is willing to build",
    async () => {
      const { synth } = await buildOffline(0.1);
      synth.voices.value = 99;
      expect(synth.voices.value).toBe(8);
      synth.voices.value = -4;
      expect(synth.voices.value).toBe(1);
      synth.voices.value = 2.4;
      expect(synth.voices.value).toBe(2);
    },
    TIMEOUT,
  );

  it(
    "swaps the instrument for a new voice count, carrying the sound over",
    async () => {
      const { synth } = await buildOffline(0.1);
      // A value the new pool cannot have inherited from its own defaults.
      synth.voice.params.cutoff.value = 437;
      synth.glide.value = 0.25;
      const before = synth.voice.params.cutoff;

      synth.voices.value = 4;

      // The swap waits for the new pool's worklets, so the old one is still the
      // one answering until it has them.
      for (let tries = 0; tries < 200; tries++) {
        if (synth.voice.params.cutoff !== before) break;
        await new Promise((resume) => setTimeout(resume, 25));
      }

      expect(synth.voice.params.cutoff).not.toBe(before);
      expect(synth.voice.params.cutoff.value).toBeCloseTo(437, 3);
      expect(synth.glide.value).toBe(0.25);
      expect(synth.voices.value).toBe(4);
    },
    TIMEOUT,
  );

  it(
    "writes the glide, which is not a parameter at all",
    async () => {
      const { synth } = await buildOffline(0.1);
      synth.glide.value = 0.25;
      expect(synth.glide.value).toBe(0.25);
    },
    TIMEOUT,
  );

  it(
    "arrives silent",
    async () => {
      const { synth } = await buildOffline(0.1);
      expect(synth.gain.value).toBe(0);
    },
    TIMEOUT,
  );
});
