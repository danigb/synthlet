/**
 * @jest-environment ./scripts/offline-audio-env.mjs
 */
import { Instrument } from "@synthlet/instrument";
import { monoVoice } from "./synths/mono-voice";

// An instrument, rendered.
//
// `offline.test.ts` renders two worklets and then a whole `MonoSynth`, and
// says of the second that it "is the closest thing there is to the instrument
// render [ticket 06] will add on top of it". This is that render: the pool, the
// sixteen fan-out `ConstantSourceNode`s, the allocator's per-voice gains and
// `setValueAtTime` on a real clock - the part of `Instrument` no mock can
// check, because a mock has no samples in it.
//
// Two overlapping notes on a pool of two, so the file asserts the one thing
// polyphony is: both voices sound, and the sum is louder than either. The
// harness and the `@jest-environment` docblock are `offline.test.ts`'s; that
// file explains why an environment rather than an import.

const SAMPLE_RATE = 48000;
const DURATION = 2;
const WINDOW = 0.01;

// A C major third, the second note 0.3 s into the first, both released at 0.9 s.
// `monoVoice`'s default amp release is 0.3 s, so two seconds is the whole event
// with room to hear it end - and a render this file pays for eight times.
const FIRST_ON = 0.1;
const SECOND_ON = 0.4;
const OFF = 0.9;

// A real render of ten worklets is slower than jest's 5 s default when the
// whole suite is running in parallel, and every timing test here is one.
const TIMEOUT = 60_000;

/** Root mean square of the 10 ms window starting at `time`. */
function rmsAt(samples: Float32Array, time: number): number {
  const from = Math.round(time * SAMPLE_RATE);
  const to = Math.min(samples.length, from + Math.round(WINDOW * SAMPLE_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

async function renderChord(): Promise<Float32Array> {
  const context = new OfflineAudioContext(
    1,
    SAMPLE_RATE * DURATION,
    SAMPLE_RATE,
  );

  // Everything before `ready`: the instrument is a node from its first line,
  // so the graph is built and the notes are queued while the worklets are
  // still registering, and `ready` flushes them.
  const synth = Instrument(context, monoVoice, { voices: 2, volume: -6 });
  synth.connect(context.destination);
  synth.start({ note: "C4", velocity: 100, time: FIRST_ON });
  synth.start({ note: "E4", velocity: 100, time: SECOND_ON });
  await synth.ready;
  // After `ready`, because `stop` before it is a cancellation of the queue -
  // nothing has been scheduled yet, so stopping is forgetting - and what this
  // wants is a note-off written at a time.
  synth.stop({ time: OFF });

  const buffer = await context.startRendering();
  // **Copied, not viewed.** `getChannelData` hands back a view of the render
  // thread's own buffer, and the next context reuses that memory: a
  // `Float32Array` kept across a second `startRendering` reads garbage, which
  // is how the determinism assertion below fails intermittently without one.
  return Float32Array.from(buffer.getChannelData(0));
}

describe("an Instrument renders offline", () => {
  let samples: Float32Array;

  beforeAll(async () => {
    samples = await renderChord();
  }, TIMEOUT);

  it(
    "builds the pool and the fan-out before it renders",
    async () => {
      const context = new OfflineAudioContext(1, 128, SAMPLE_RATE);
      const synth = Instrument(context, monoVoice, { voices: 2 });

      expect(synth.voices).toEqual([]);
      await synth.ready;

      expect(synth.voices).toHaveLength(2);
      expect(Object.keys(synth.params)).toEqual(Object.keys(monoVoice.params));
      // A real `AudioParam`, sitting at the declared default rather than at 0.
      expect(synth.params.cutoff.value).toBe(monoVoice.params.cutoff.default);

      await context.startRendering();
    },
    TIMEOUT,
  );

  it("is silent before the first note", () => {
    expect(rmsAt(samples, 0)).toBe(0);
    expect(rmsAt(samples, FIRST_ON - WINDOW)).toBe(0);
  });

  it("sounds the first note", () => {
    expect(rmsAt(samples, FIRST_ON + 0.05)).toBeGreaterThan(0.01);
  });

  it("adds the second voice without stealing the first", () => {
    // Two voices sounding together are louder than one. If the second note had
    // stolen the first's voice - a pool of one, or an allocator that reuses -
    // this would be flat instead.
    const one = rmsAt(samples, SECOND_ON - WINDOW);
    const two = rmsAt(samples, SECOND_ON + 0.3);

    expect(one).toBeGreaterThan(0.01);
    expect(two).toBeGreaterThan(one * 1.2);
  });

  it("holds both notes until they are released", () => {
    for (let t = SECOND_ON + 0.3; t < OFF; t += 0.1) {
      expect(rmsAt(samples, t)).toBeGreaterThan(0.01);
    }
  });

  it("releases on stop", () => {
    const held = rmsAt(samples, OFF - WINDOW);
    // The amp release is 0.3 s and it is exponential, so "silent" is a floor.
    expect(rmsAt(samples, OFF + 0.1)).toBeLessThan(held);
    expect(rmsAt(samples, OFF + 0.6)).toBeLessThan(held / 100);
  });

  it("is not silent overall", () => {
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeGreaterThan(0.05);
  });

  // The property that makes an offline render usable as a reference at all,
  // and the one an instrument could plausibly break: a pool is stateful, and
  // an allocator that carried a voice index across renders, or a definition
  // that seeded itself from a clock, would show up here.
  it(
    "renders the same notes identically twice",
    async () => {
      const second = await renderChord();

      expect(second.length).toBe(samples.length);
      let differences = 0;
      for (let i = 0; i < samples.length; i++) {
        if (samples[i] !== second[i]) differences++;
      }
      expect(differences).toBe(0);
    },
    TIMEOUT,
  );
});

describe("a preset is audible", () => {
  it(
    "makes Pad quieter than Init at the note's start",
    async () => {
      const attackOf = async (preset: string) => {
        const context = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
        const synth = Instrument(context, monoVoice, { voices: 1, preset });
        synth.connect(context.destination);
        synth.start({ note: "C4", time: 0.1, duration: 0.5 });
        await synth.ready;
        const buffer = await context.startRendering();
        return rmsAt(Float32Array.from(buffer.getChannelData(0)), 0.15);
      };

      // Init's amp attack is 0.01 s and Pad's is 0.8 s, so 50 ms in they are two
      // different sounds - which is the whole claim a preset makes.
      expect(await attackOf("Pad")).toBeLessThan((await attackOf("Init")) / 2);
    },
    TIMEOUT,
  );
});
