import {
  AudioNodeMock,
  AudioParamMock,
  AutomationEvent,
  BiquadFilterNodeMock,
  ConstantSourceNodeMock,
  createAudioContextMock,
  GainNodeMock,
} from "../../synthlet/src/test-utils";
import { disposable } from "./_worklet";
import {
  ArpConfig,
  Instrument,
  InstrumentNode,
  toFrequency,
  Voice,
  VoiceDefinition,
} from "./index";

/**
 * `Instrument` on the Web Audio mock.
 *
 * A note is automation on a param that already exists - nothing is connected
 * to start one - so every assertion here reads an `AudioParamMock`'s event
 * log, which is exactly the sequence the audio thread would see.
 */

/** The mock behind a node or param the module built against the DOM types. */
const asNode = (x: unknown) => x as unknown as AudioNodeMock;
const asParam = (x: unknown) => x as unknown as AudioParamMock;
const events = (x: unknown): AutomationEvent[] => asParam(x).events;
const writes = (x: unknown) =>
  events(x).filter((e) => e.method === "setValueAtTime");

/** A voice whose filter takes the instrument's one declared parameter. */
type StubVoice = Voice & { filter: BiquadFilterNodeMock };

type Stub = VoiceDefinition<"cutoff", StubVoice> & {
  registrations: number;
  inlets: Record<"cutoff", AudioNode>[];
};

function stubDefinition(
  overrides: Partial<VoiceDefinition<"cutoff", StubVoice>> = {},
) {
  const definition: Stub = {
    registrations: 0,
    inlets: [],
    params: { cutoff: { default: 1200, min: 20, max: 20000, unit: "Hz" } },
    register: async () => {
      definition.registrations++;
    },
    create: (context, inlets) => {
      definition.inlets.push(inlets);
      const filter = new BiquadFilterNode(
        context,
      ) as unknown as BiquadFilterNodeMock;
      const out = new GainNode(context);
      asNode(filter).connect(out);
      // The one wire a definition is expected to make: the fan-out into the
      // parameter it belongs to, in every voice.
      inlets.cutoff.connect(filter.frequency as unknown as AudioParam);
      return Object.assign(disposable(out, [filter as unknown as AudioNode]), {
        filter,
        gate: new AudioParamMock() as unknown as AudioParam,
        frequency: new AudioParamMock() as unknown as AudioParam,
      });
    },
    ...overrides,
  };
  return definition;
}

type Built = {
  context: AudioContext;
  nodes: AudioNodeMock[];
  definition: Stub;
  synth: InstrumentNode<"cutoff", StubVoice>;
};

/** An instrument whose pool is built, which is what most criteria assume. */
async function built(
  options: Parameters<typeof Instrument>[2] = {},
  overrides: Partial<VoiceDefinition<"cutoff", StubVoice>> = {},
): Promise<Built> {
  const { context, nodes } = createAudioContextMock();
  const definition = stubDefinition(overrides);
  const synth = Instrument(context, definition, options);
  await synth.ready;
  return { context, nodes, definition, synth };
}

const kinds = (nodes: AudioNodeMock[], kind: string) =>
  nodes.filter((node) => node.kind === kind);

describe("construction", () => {
  it("is synchronous and connectable before ready", () => {
    const { context, nodes } = createAudioContextMock();
    const definition = stubDefinition();

    const synth = Instrument(context, definition, { voices: 4 });
    const destination = new GainNode(context);
    synth.connect(destination);

    // Nothing but the output gain exists yet.
    expect(nodes.map((node) => node.kind)).toEqual(["GainNode", "GainNode"]);
    expect(asNode(synth).connections).toEqual([destination]);
    expect(synth.voices).toEqual([]);
    expect(synth.params).toEqual({});
  });

  it("takes its volume in dB and publishes the linear gain", () => {
    const { context } = createAudioContextMock();

    expect(Instrument(context, stubDefinition()).volume.value).toBeCloseTo(
      1,
      12,
    );
    expect(
      Instrument(context, stubDefinition(), { volume: -6 }).volume.value,
    ).toBeCloseTo(0.5011872336, 9);
  });

  it("builds exactly `voices` voices, once, on ready", async () => {
    const { nodes, definition, synth } = await built({ voices: 8 });

    expect(definition.registrations).toBe(1);
    expect(synth.voices.length).toBe(8);
    // Eight voice outputs plus eight voice gains plus the instrument's own.
    expect(kinds(nodes, "GainNode").length).toBe(17);
    expect(kinds(nodes, "BiquadFilterNode").length).toBe(8);
    // One fan-out node per declared parameter, not per voice.
    expect(kinds(nodes, "ConstantSourceNode").length).toBe(1);
  });

  it("hands every voice the same inlets object", async () => {
    const { definition } = await built({ voices: 8 });

    expect(definition.inlets.length).toBe(8);
    for (const inlets of definition.inlets) {
      expect(inlets).toBe(definition.inlets[0]);
    }
  });

  it("connects one fan-out node to the same parameter in every voice", async () => {
    const { nodes, synth } = await built({ voices: 8 });

    const fanout = kinds(
      nodes,
      "ConstantSourceNode",
    )[0] as ConstantSourceNodeMock;
    expect(synth.params.cutoff).toBe(fanout.offset as unknown as AudioParam);
    expect(fanout.connections).toEqual(
      synth.voices.map((voice) => voice.filter.frequency),
    );
  });

  it("routes every voice through its own gain into the output", async () => {
    const { synth } = await built({ voices: 2 });

    for (const voice of synth.voices) {
      const [gain] = asNode(voice).connections as AudioNodeMock[];
      expect(gain.kind).toBe("GainNode");
      expect(gain.connections).toEqual([synth]);
    }
  });
});

describe("start", () => {
  it("writes pitch, then level, then the gate, all at the note's time", async () => {
    const { synth } = await built();

    const stop = synth.start({ note: 69, time: 2 });
    const voice = stop.voice!;

    expect(writes(voice.frequency)).toEqual([
      { method: "setValueAtTime", value: 440, time: 2 },
    ]);
    // The gate rises last, so pitch and level are in place when it does.
    const gain = asNode(voice).connections[0] as GainNodeMock;
    expect(gain.gain.events.map((e) => e.time)).toEqual([2]);
    expect(writes(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 2 },
    ]);
  });

  it("reads a note name and a note number as the same pitch", async () => {
    const byName = await built();
    const byNumber = await built();

    const a = byName.synth.start({ note: "A4", time: 1 }).voice!;
    const b = byNumber.synth.start({ note: 69, time: 1 }).voice!;

    expect(writes(a.frequency)).toEqual(writes(b.frequency));
    expect(writes(a.frequency)[0].value).toBe(440);
  });

  it("is equal temperament for every note it is given", async () => {
    const { synth } = await built();

    const c4 = synth.start({ note: "C4", time: 1 }).voice!;
    const c5 = synth.start({ note: "C5", time: 1 }).voice!;

    expect(writes(c4.frequency)[0].value).toBeCloseTo(261.6255653, 6);
    expect(writes(c5.frequency)[0].value).toBeCloseTo(523.2511306, 6);
  });

  it("defaults to now when no time is given", async () => {
    const { context, synth } = await built();
    (context as any).currentTime = 1.25;

    const voice = synth.start({ note: 60 }).voice!;

    expect(writes(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1.25 },
    ]);
  });

  describe("velocity", () => {
    it("lands on the voice's gain as (v/127)²", async () => {
      const { synth } = await built();

      const voice = synth.start({ note: 60, velocity: 64, time: 1 }).voice!;

      const gain = asNode(voice).connections[0] as GainNodeMock;
      expect(gain.gain.events[0].value).toBeCloseTo((64 / 127) ** 2, 12);
    });

    it("defaults to 100", async () => {
      const { synth } = await built();

      const voice = synth.start({ note: 60, time: 1 }).voice!;

      const gain = asNode(voice).connections[0] as GainNodeMock;
      expect(gain.gain.events[0].value).toBeCloseTo((100 / 127) ** 2, 12);
    });

    it("also reaches a voice that declares its own velocity param", async () => {
      const velocity = new AudioParamMock();
      const inner = stubDefinition();
      const { synth } = await built(
        {},
        {
          create: (context, inlets) =>
            Object.assign(inner.create(context, inlets), {
              velocity: velocity as unknown as AudioParam,
            }),
        },
      );

      synth.start({ note: 60, velocity: 127, time: 1 });

      expect(velocity.events).toEqual([
        { method: "setValueAtTime", value: 1, time: 1 },
      ]);
    });

    it("takes the definition's own curve when it declares one", async () => {
      const { synth } = await built({}, { velocityToGain: (v) => v / 127 });

      const voice = synth.start({ note: 60, velocity: 64, time: 1 }).voice!;

      const gain = asNode(voice).connections[0] as GainNodeMock;
      expect(gain.gain.events[0].value).toBeCloseTo(64 / 127, 12);
    });
  });

  it("schedules the note-off itself when given a duration", async () => {
    const { synth } = await built();

    const voice = synth.start({ note: 60, time: 1, duration: 0.5 }).voice!;

    expect(writes(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
      { method: "setValueAtTime", value: 0, time: 1.5 },
    ]);
  });

  it("retriggers a held note with a one-sample gate dip", async () => {
    const { context, synth } = await built();

    const first = synth.start({ note: 60, time: 1 }).voice!;
    const second = synth.start({ note: 60, time: 2 }).voice!;

    expect(second).toBe(first);
    expect(writes(first.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
      // The gate contract fires on the transition, so the envelope has to see
      // it fall before it can rise again.
      { method: "setValueAtTime", value: 0, time: 2 - 1 / context.sampleRate },
      { method: "setValueAtTime", value: 1, time: 2 },
    ]);
  });

  it("gives a repeated note its own voice when the definition asks", async () => {
    const { synth } = await built({}, { sameNoteReuse: false });

    const first = synth.start({ note: 60, time: 1 }).voice!;
    const second = synth.start({ note: 60, time: 2 }).voice!;

    expect(second).not.toBe(first);
    expect(writes(second.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 2 },
    ]);
  });

  it("returns a stop function carrying the voice it allocated", async () => {
    const { synth } = await built({ voices: 4 });

    const stop = synth.start({ note: 60, time: 1 });

    expect(stop.voice).toBe(synth.voices[0]);
    stop(3);

    expect(writes(stop.voice!.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
      { method: "setValueAtTime", value: 0, time: 3 },
    ]);
    // And only that voice.
    expect(events(synth.voices[1].gate)).toEqual([]);
  });
});

describe("stealing", () => {
  it("fades the losing voice out, ending at the new note", async () => {
    const { synth } = await built({ voices: 8, stealFade: 0.005 });

    for (let i = 0; i < 8; i++) synth.start({ note: 60 + i, time: 1 });
    const stolen = synth.voices[1]; // Protect keeps the outer two
    const ninth = synth.start({ note: 75, time: 4 });

    expect(ninth.voice).toBe(stolen);
    const gain = asNode(stolen).connections[0] as GainNodeMock;
    expect(gain.gain.events.slice(1)).toEqual([
      { method: "cancelScheduledValues", time: 3.995 },
      { method: "setValueAtTime", value: 0, time: 3.995 },
      { method: "linearRampToValueAtTime", value: 0, time: 4 },
      // The new note's level, after the fade has finished.
      { method: "setValueAtTime", value: (100 / 127) ** 2, time: 4 },
    ]);
    expect(writes(stolen.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
      { method: "setValueAtTime", value: 0, time: 3.995 },
      { method: "setValueAtTime", value: 1, time: 4 },
    ]);
  });

  it("delays a note that steals at 'now' by the fade", async () => {
    const { context, synth } = await built({ voices: 2, stealFade: 0.01 });
    (context as any).currentTime = 5;

    synth.start({ note: 60 });
    synth.start({ note: 62 });
    const stolen = synth.start({ note: 64 }).voice!;

    // The trade-off the fade buys: a click avoided, 10 ms late.
    expect(writes(stolen.gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 1,
      time: 5.01,
    });
  });

  it('sounds nothing at all under steal: "drop"', async () => {
    const { synth } = await built({ voices: 2, steal: "drop" });

    synth.start({ note: 60, time: 1 });
    synth.start({ note: 62, time: 1 });
    const dropped = synth.start({ note: 64, time: 1 });

    expect(dropped.voice).toBeNull();
    expect(() => dropped()).not.toThrow();
    for (const voice of synth.voices) {
      expect(writes(voice.gate).length).toBe(1);
    }
  });
});

describe("stop", () => {
  it("stops one note, now, when given a note", async () => {
    const { context, synth } = await built();
    (context as any).currentTime = 2;
    const voice = synth.start({ note: 60, time: 1 }).voice!;
    synth.start({ note: 64, time: 1 });

    synth.stop("C4");

    expect(events(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
      { method: "cancelScheduledValues", time: 2 },
      { method: "setValueAtTime", value: 0, time: 2 },
    ]);
    expect(writes(synth.voices[1].gate).length).toBe(1);
  });

  it("stops one note at a time when given both", async () => {
    const { synth } = await built();
    const voice = synth.start({ note: 60, time: 1 }).voice!;

    synth.stop({ note: 60, time: 3 });

    expect(writes(voice.gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 0,
      time: 3,
    });
  });

  it("ignores a note nobody is holding", async () => {
    const { synth } = await built();

    expect(() => synth.stop(60)).not.toThrow();
    for (const voice of synth.voices) expect(events(voice.gate)).toEqual([]);
  });

  it("cuts everything, sounding or merely scheduled", async () => {
    // Play's `stopAll(time)` contract, and it is exact: a future note is a
    // pending setValueAtTime, so cancelling at `time` removes it.
    const { synth } = await built({ voices: 4 });
    const voice = synth.start({ note: 60, time: 5 }).voice!;

    synth.stop({ time: 2 });

    expect(events(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 5 },
      { method: "cancelScheduledValues", time: 2 },
      { method: "setValueAtTime", value: 0, time: 2 },
    ]);
    // The log records calls, not the timeline the param keeps: what makes the
    // note-on at 5 unreachable is that the cancel was called after it, and
    // nothing raises the gate again afterwards.
    const cancelled = events(voice.gate).findIndex(
      (e) => e.method === "cancelScheduledValues",
    );
    expect(cancelled).toBe(1);
    expect(
      events(voice.gate)
        .slice(cancelled)
        .some((e) => e.value === 1),
    ).toBe(false);
    // And the pitch and level writes scheduled for that note are gone too.
    expect(events(voice.frequency).at(-1)).toEqual({
      method: "cancelScheduledValues",
      time: 2,
    });
    const gain = asNode(voice).connections[0] as GainNodeMock;
    expect(gain.gain.events.at(-1)).toEqual({
      method: "cancelScheduledValues",
      time: 2,
    });
  });

  it("frees every voice, so the next note starts from the top of the pool", async () => {
    const { synth } = await built({ voices: 4 });
    for (let i = 0; i < 4; i++) synth.start({ note: 60 + i, time: 1 });

    synth.stop({ time: 2 });
    const next = synth.start({ note: 72, time: 3 });

    expect(next.voice).toBe(synth.voices[0]);
  });
});

describe("before ready", () => {
  it("schedules a queued note whose time is still ahead", async () => {
    const { context, nodes } = createAudioContextMock();
    (context as any).currentTime = 1;
    const synth = Instrument(context, stubDefinition(), { voices: 2 });

    synth.start({ note: 60, velocity: 64, time: 4, duration: 0.5 });
    await synth.ready;

    const voice = synth.voices[0];
    expect(writes(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 4 },
      { method: "setValueAtTime", value: 0, time: 4.5 },
    ]);
    expect(writes(voice.frequency)[0].value).toBeCloseTo(261.6255653, 6);
    expect(nodes.length).toBeGreaterThan(1);
  });

  it("drops one that is already late, silently", async () => {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stubDefinition(), { voices: 2 });

    synth.start({ note: 60, time: 1 });
    (context as any).currentTime = 3;
    await synth.ready;

    for (const voice of synth.voices) expect(events(voice.gate)).toEqual([]);
  });

  it("forgets a queued note that is stopped before it is flushed", async () => {
    const { context } = createAudioContextMock();
    const synth = Instrument(context, stubDefinition(), { voices: 2 });

    synth.start({ note: 60, time: 4 });
    synth.start({ note: 64, time: 4 });
    synth.stop(60);
    await synth.ready;

    expect(writes(synth.voices[0].frequency)[0].value).toBeCloseTo(
      329.6275569,
      6,
    );
    expect(events(synth.voices[1].gate)).toEqual([]);
  });
});

describe("dispose", () => {
  // `disposable`'s teardown always ends in a disconnect(), so "reached by
  // dispose()" is exactly "disconnect() was called" - the same reading
  // `synths/dispose.test.ts` takes.
  const leaked = (nodes: AudioNodeMock[]) =>
    nodes.filter((node) => node.disconnectCount === 0).map((node) => node.kind);

  it("reaches every node it created", async () => {
    const { nodes, synth } = await built({ voices: 4 });

    expect(nodes.length).toBeGreaterThan(5);
    synth.dispose();

    expect(leaked(nodes)).toEqual([]);
  });

  it("is idempotent", async () => {
    const { nodes, synth } = await built({ voices: 4 });

    synth.dispose();
    const counts = nodes.map((node) => node.disconnectCount);
    synth.dispose();

    expect(nodes.map((node) => node.disconnectCount)).toEqual(counts);
  });

  it("reaches the pool even when it was disposed before ready", async () => {
    const { context, nodes } = createAudioContextMock();
    const synth = Instrument(context, stubDefinition(), { voices: 4 });

    synth.dispose();
    await synth.ready;

    expect(nodes.length).toBeGreaterThan(5);
    expect(leaked(nodes)).toEqual([]);
  });
});

describe("the play adapter", () => {
  // The criterion the vision sets: a host swaps a sampled piano for a synth
  // pad and nothing else changes. `play/packages/clef/src/instrument.ts` is
  // the seam, and fitting it is a rename and a velocity scale.
  type Seconds = number;
  type PlayNoteEvent = {
    pitch: number;
    time: Seconds;
    duration: Seconds;
    velocity: number; // 0..1
  };
  type PlayInstrument = {
    start(event: PlayNoteEvent): void;
    stopAll(time: Seconds): void;
    dispose(): void;
  };

  const toPlay = (synth: InstrumentNode<string, Voice>): PlayInstrument => ({
    start: ({ pitch, time, duration, velocity }) =>
      void synth.start({
        note: pitch,
        time,
        duration,
        velocity: velocity * 127,
      }),
    stopAll: (time) => synth.stop({ time }),
    dispose: () => synth.dispose(),
  });

  it("is a pitch rename and a velocity scale", async () => {
    const { nodes, synth } = await built({ voices: 4 });
    const instrument = toPlay(synth);

    instrument.start({ pitch: 69, time: 1, duration: 0.5, velocity: 0.5 });

    const voice = synth.voices[0];
    expect(writes(voice.frequency)[0].value).toBe(440);
    expect(writes(voice.gate).map((e) => e.time)).toEqual([1, 1.5]);
    const gain = asNode(voice).connections[0] as GainNodeMock;
    expect(gain.gain.events[0].value).toBeCloseTo((63.5 / 127) ** 2, 12);

    instrument.stopAll(2);
    expect(events(voice.gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 0,
      time: 2,
    });

    instrument.dispose();
    expect(nodes.filter((n) => n.disconnectCount === 0)).toEqual([]);
  });
});

describe("voices: 1", () => {
  // A pool of one is not a monosynth: `mono.test.ts` asserts the algorithm on
  // data, and this asserts that the instrument writes it into the one voice.
  const gateWrites = (synth: InstrumentNode<"cutoff", StubVoice>) =>
    writes(synth.voices[0].gate);
  const pitches = (synth: InstrumentNode<"cutoff", StubVoice>) =>
    events(synth.voices[0].frequency);

  it("returns to the note underneath when the top key is released", async () => {
    const { synth } = await built({ voices: 1 });

    synth.start({ note: 60, velocity: 40, time: 1 });
    synth.start({ note: 64, velocity: 110, time: 2 });
    synth.stop({ note: 64, time: 3 });

    expect(pitches(synth).map((e) => e.value)).toEqual([
      toFrequency(60),
      toFrequency(64),
      toFrequency(60),
    ]);
    // With 60's own velocity: a quiet low note stays quiet.
    const gain = asNode(synth.voices[0]).connections[0] as GainNodeMock;
    expect(gain.gain.events.map((e) => e.value)).toEqual([
      (40 / 127) ** 2,
      (110 / 127) ** 2,
      (40 / 127) ** 2,
    ]);
    // The note is not left silent: the gate ends high.
    expect(gateWrites(synth).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 1,
      time: 3,
    });
  });

  it("closes the gate exactly once when the last key comes up", async () => {
    const { synth } = await built({ voices: 1 });

    synth.start({ note: 60, time: 1 });
    synth.start({ note: 64, time: 2 });
    synth.stop({ note: 64, time: 3 });
    synth.stop({ note: 60, time: 4 });

    expect(
      gateWrites(synth).filter((e) => e.value === 0 && e.time === 4),
    ).toEqual([{ method: "setValueAtTime", value: 0, time: 4 }]);
    expect(gateWrites(synth).at(-1)!.value).toBe(0);
  });

  it("dips the gate by one sample on a note change, by default", async () => {
    const { context, synth } = await built({ voices: 1 });

    synth.start({ note: 60, time: 1 });
    synth.start({ note: 64, time: 2 });

    expect(gateWrites(synth)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
      { method: "setValueAtTime", value: 0, time: 2 - 1 / context.sampleRate },
      { method: "setValueAtTime", value: 1, time: 2 },
    ]);
  });

  it("never writes the gate under legato while a key is held", async () => {
    const { synth } = await built({ voices: 1, legato: true });

    synth.start({ note: 60, time: 1 });
    synth.start({ note: 64, time: 2 });
    synth.stop({ note: 64, time: 3 });

    expect(gateWrites(synth)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
    ]);
    // But the pitch still moves, twice.
    expect(pitches(synth).length).toBe(3);
  });

  it("takes its priority from the options", async () => {
    const { synth } = await built({ voices: 1, priority: "low" });

    synth.start({ note: 60, time: 1 });
    synth.start({ note: 72, time: 2 }); // higher, so it never speaks

    expect(pitches(synth).map((e) => e.value)).toEqual([toFrequency(60)]);
  });

  it("cuts everything on the all-notes form", async () => {
    const { synth } = await built({ voices: 1 });
    synth.start({ note: 60, time: 1 });
    synth.start({ note: 64, time: 2 });

    synth.stop({ time: 5 });

    expect(events(synth.voices[0].gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 0,
      time: 5,
    });
    // And a key that was still down is forgotten, so the next note attacks.
    synth.start({ note: 67, time: 6 });
    expect(gateWrites(synth).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 1,
      time: 6,
    });
  });
});

describe("glide", () => {
  const ramps = (voice: StubVoice) =>
    events(voice.frequency).filter(
      (e) => e.method === "exponentialRampToValueAtTime",
    );

  it("steps the first note and ramps the next", async () => {
    const { synth } = await built({ voices: 1, glide: 0.1 });

    synth.start({ note: 60, time: 1 });
    synth.start({ note: 64, time: 2 });

    expect(events(synth.voices[0].frequency)).toEqual([
      // Nothing to glide from yet.
      { method: "setValueAtTime", value: toFrequency(60), time: 1 },
      // The ramp needs a start point at the note's own time.
      { method: "setValueAtTime", value: toFrequency(60), time: 2 },
      {
        method: "exponentialRampToValueAtTime",
        value: toFrequency(64),
        time: 2.1,
      },
    ]);
  });

  it("is byte-identical to no glide at all when it is zero", async () => {
    const withZero = await built({ voices: 1, glide: 0 });
    const without = await built({ voices: 1 });

    for (const synth of [withZero.synth, without.synth]) {
      synth.start({ note: 60, time: 1 });
      synth.start({ note: 64, time: 2 });
      synth.stop({ note: 64, time: 3 });
    }

    expect(events(withZero.synth.voices[0].frequency)).toEqual(
      events(without.synth.voices[0].frequency),
    );
    expect(events(withZero.synth.voices[0].gate)).toEqual(
      events(without.synth.voices[0].gate),
    );
  });

  it("is live-settable", async () => {
    const { synth } = await built({ voices: 1 });

    synth.start({ note: 60, time: 1 });
    expect(synth.glide).toBe(0);
    synth.glide = 0.25;
    synth.start({ note: 64, time: 2 });

    expect(ramps(synth.voices[0])).toEqual([
      {
        method: "exponentialRampToValueAtTime",
        value: toFrequency(64),
        time: 2.25,
      },
    ]);
  });

  it("is per voice on a poly pool, each from its own last note", async () => {
    const { synth } = await built({ voices: 8, glide: 0.1 });

    // Eight voices, eight different notes, then all released so the pool is
    // free again.
    for (let i = 0; i < 8; i++) synth.start({ note: 40 + i, time: 1 });
    synth.stop({ time: 2 });
    // A second round: every voice now has a previous note of its own.
    for (let i = 0; i < 8; i++) synth.start({ note: 80 + i, time: 3 });

    const froms = synth.voices.map(
      (voice) =>
        events(voice.frequency).filter(
          (e) => e.method === "setValueAtTime" && e.time === 3,
        )[0].value,
    );
    expect(froms.slice().sort((a, b) => a! - b!)).toEqual(
      [40, 41, 42, 43, 44, 45, 46, 47].map(toFrequency),
    );
    for (const voice of synth.voices) {
      expect(ramps(voice).length).toBe(1);
      expect(ramps(voice)[0].time).toBe(3.1);
    }
  });

  it("steps a voice that has never sounded", async () => {
    const { synth } = await built({ voices: 4, glide: 0.1 });

    synth.start({ note: 60, time: 1 });

    expect(events(synth.voices[0].frequency)).toEqual([
      { method: "setValueAtTime", value: toFrequency(60), time: 1 },
    ]);
  });
});

describe("hold", () => {
  it("swallows a note-off and applies it when the pedal lifts", async () => {
    const { context, synth } = await built({ voices: 4 });
    const voice = synth.start({ note: 60, time: 1 }).voice!;

    synth.hold = true;
    synth.stop(60);
    expect(writes(voice.gate)).toEqual([
      { method: "setValueAtTime", value: 1, time: 1 },
    ]);

    (context as any).currentTime = 4;
    synth.hold = false;

    expect(writes(voice.gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 0,
      time: 4,
    });
    expect(synth.hold).toBe(false);
  });

  it("cancels the deferral when the key goes down again", async () => {
    const { context, synth } = await built({ voices: 4 });
    const voice = synth.start({ note: 60, time: 1 }).voice!;

    synth.hold = true;
    synth.stop(60);
    synth.start({ note: 60, time: 2 });
    (context as any).currentTime = 4;
    synth.hold = false;

    // The key is down: releasing the pedal must not stop it.
    expect(writes(voice.gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 1,
      time: 2,
    });
  });

  it("works on the mono path too", async () => {
    const { context, synth } = await built({ voices: 1 });
    synth.start({ note: 60, time: 1 });

    synth.hold = true;
    synth.stop(60);
    expect(writes(synth.voices[0].gate).at(-1)!.value).toBe(1);

    (context as any).currentTime = 4;
    synth.hold = false;

    expect(writes(synth.voices[0].gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 0,
      time: 4,
    });
  });

  it("is ignored by the all-notes form, which empties the deferred set", async () => {
    const { context, synth } = await built({ voices: 4 });
    const voice = synth.start({ note: 60, time: 1 }).voice!;

    synth.hold = true;
    synth.stop(60);
    synth.stop({ time: 3 });

    expect(events(voice.gate).at(-1)).toEqual({
      method: "setValueAtTime",
      value: 0,
      time: 3,
    });

    // Nothing is left to apply, so lifting the pedal writes nothing more.
    const before = events(voice.gate).length;
    (context as any).currentTime = 5;
    synth.hold = false;
    expect(events(voice.gate).length).toBe(before);
  });
});

describe("the mono options at voices > 1", () => {
  it("leave a poly instrument exactly as it was", async () => {
    // Priority and legato are a monosynth's, not a pool's: a pool picks a
    // voice, not a note.
    const plain = await built({ voices: 4 });
    const decorated = await built({
      voices: 4,
      priority: "low",
      legato: true,
    });

    for (const synth of [plain.synth, decorated.synth]) {
      synth.start({ note: 60, time: 1 });
      synth.start({ note: 72, time: 2 });
      synth.stop({ note: 72, time: 3 });
      synth.stop({ note: 60, time: 4 });
    }

    const log = (synth: InstrumentNode<"cutoff", StubVoice>) =>
      synth.voices.map((voice) => [
        events(voice.gate),
        events(voice.frequency),
      ]);
    expect(log(decorated.synth)).toEqual(log(plain.synth));
  });
});

// ---------------------------------------------------------------------------
// An arpeggiator over the held notes
//
// `arp.test.ts` proves the *sequence* against the pure state machine. What is
// left for here is the half that only exists once there is a pool: that the
// events become the right automation, on the right voice, at the right time.

/** The MIDI note a frequency write meant. `undefined` is a ramp with no value. */
const asMidi = (hz: number | undefined) =>
  Math.round(69 + 12 * Math.log2((hz ?? NaN) / 440));

/**
 * Every note the pool started - its pitch, the level it was started at, and
 * when - in time order. This *is* the arpeggio, as the audio thread sees it.
 */
function arpeggio(synth: InstrumentNode<"cutoff", StubVoice>) {
  const out: { note: number; gain: number; time: number }[] = [];
  for (const voice of synth.voices) {
    const gain = asNode(voice).connections[0] as GainNodeMock;
    for (const write of writes(voice.frequency)) {
      const level = gain.gain.events.find(
        (e) => e.method === "setValueAtTime" && e.time === write.time,
      );
      out.push({
        note: asMidi(write.value),
        gain: level?.value ?? NaN,
        time: write.time,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

const notesOf = (synth: InstrumentNode<"cutoff", StubVoice>) =>
  arpeggio(synth).map((e) => e.note);

/** The notes started at exactly `time` - one step's worth. */
const notesAt = (synth: InstrumentNode<"cutoff", StubVoice>, time: number) =>
  arpeggio(synth)
    .filter((e) => e.time === time)
    .map((e) => e.note);

/** The voice whose gate rose at `time`, which is the one that sounded then. */
const voiceAt = (
  synth: InstrumentNode<"cutoff", StubVoice>,
  time: number,
): StubVoice =>
  synth.voices.find((voice) =>
    events(voice.gate).some(
      (e) => e.method === "setValueAtTime" && e.value === 1 && e.time === time,
    ),
  )!;

describe("the arpeggiator", () => {
  describe("the surface", () => {
    it("is null until a config is assigned", async () => {
      const { synth } = await built();
      expect(synth.arp).toBe(null);
      expect(synth.latch).toBe(false);
    });

    it("normalises whatever it is assigned", async () => {
      const { synth } = await built();
      synth.arp = { mode: "Up" } as any;
      // Complete and frozen, so it round-trips as one value.
      expect(synth.arp).toEqual({
        mode: "Up",
        order: "pitch",
        octaves: 1,
        octaveMode: "serial",
      });
      expect(Object.isFrozen(synth.arp)).toBe(true);
    });

    it("throws on a bad mode at the setter", async () => {
      const { synth } = await built();
      expect(() => {
        synth.arp = { mode: "Sideways" } as any;
      }).toThrow(/Unknown arp mode "Sideways"/);
      expect(synth.arp).toBe(null);
    });

    it("sounds nothing when a key goes down", async () => {
      // Criterion 8: a step is what sounds. Every param's log is untouched.
      const { synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("Up");

      const handle = synth.start({ note: 60, velocity: 100, time: 1 });

      expect(handle.voice).toBe(null);
      expect(arpeggio(synth)).toEqual([]);
      for (const voice of synth.voices) {
        expect(events(voice.gate)).toEqual([]);
        expect(events(voice.frequency)).toEqual([]);
      }
    });

    it("does nothing on a step before ready", async () => {
      // Criterion 12: a step is a musical instant, not an event with a time
      // worth queueing, so it is dropped rather than kept.
      const { context } = createAudioContextMock();
      const synth = Instrument(context, stubDefinition(), { voices: 4 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 1 });

      synth.arpStep(1);
      expect(synth.voices).toEqual([]);

      await synth.ready;
      // And the queued note did not sound on its own either: with an arp
      // configured it is a note of the chord, so a step is still what sounds.
      expect(notesOf(synth)).toEqual([]);

      synth.arpStep(1);
      expect(notesOf(synth)).toEqual([60]);
    });

    it("does nothing on a step with no config", async () => {
      const { synth } = await built({ voices: 4 });
      synth.start({ note: 60, time: 1 });
      synth.arpStep(2);
      // The note the plain poly started, and nothing the arp added.
      expect(notesOf(synth)).toEqual([60]);
    });
  });

  describe("a step's automation", () => {
    it("stops the previous note one sample before the next starts", async () => {
      // Criterion 5. Two `setValueAtTime` calls at one instant are not an
      // edge the audio thread can see, so the release lands a sample early.
      const { context, synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 0 });
      synth.start({ note: 64, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);

      const first = voiceAt(synth, 1);
      const second = voiceAt(synth, 2);
      expect(asMidi(writes(first.frequency)[0].value)).toBe(60);
      expect(asMidi(writes(second.frequency)[0].value)).toBe(64);
      // The 60 closes at 2 - one sample; the 64 opens at 2.
      expect(writes(first.gate)).toEqual([
        { method: "setValueAtTime", value: 1, time: 1 },
        {
          method: "setValueAtTime",
          value: 0,
          time: 2 - 1 / context.sampleRate,
        },
      ]);
      expect(writes(second.gate)).toEqual([
        { method: "setValueAtTime", value: 1, time: 2 },
      ]);
    });

    it("ends the note at time + duration when one is given", async () => {
      const { synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 0 });

      synth.arpStep(1, 0.1);

      expect(writes(voiceAt(synth, 1).gate)).toEqual([
        { method: "setValueAtTime", value: 1, time: 1 },
        { method: "setValueAtTime", value: 0, time: 1.1 },
      ]);
    });

    it("carries each note's own velocity onto the voice gain", async () => {
      // Criterion 4, at the automation level: a quiet C and a loud E come back
      // as (40/127)² and (120/127)² on the gains the allocator owns.
      const { synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, velocity: 40, time: 0 });
      synth.start({ note: 64, velocity: 120, time: 0 });

      for (let i = 1; i <= 4; i++) synth.arpStep(i);

      const played = arpeggio(synth);
      expect(played.map((e) => e.note)).toEqual([60, 64, 60, 64]);
      for (const event of played) {
        const expected = event.note === 60 ? (40 / 127) ** 2 : (120 / 127) ** 2;
        expect(event.gain).toBeCloseTo(expected, 12);
      }
    });

    it("walks the held set in pitch order, and in press order when asked", async () => {
      const pitch = await built({ voices: 6 });
      pitch.synth.arp = ArpConfig("Up");
      for (const note of [64, 60, 67]) pitch.synth.start({ note, time: 0 });
      for (let i = 1; i <= 3; i++) pitch.synth.arpStep(i);
      expect(notesOf(pitch.synth)).toEqual([60, 64, 67]);

      const played = await built({ voices: 6 });
      played.synth.arp = ArpConfig("Up", { order: "played" });
      for (const note of [64, 60, 67]) played.synth.start({ note, time: 0 });
      for (let i = 1; i <= 3; i++) played.synth.arpStep(i);
      expect(notesOf(played.synth)).toEqual([64, 60, 67]);
    });

    it("sounds the whole chord on every step under Chord", async () => {
      // Criterion 3: a mode only a polyphonic output can have, which is why
      // it could never have been a member of `@synthlet/arp`'s enum.
      const { synth } = await built({ voices: 6 });
      synth.arp = ArpConfig("Chord");
      synth.start({ note: 60, velocity: 40, time: 0 });
      synth.start({ note: 64, velocity: 120, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);

      const played = arpeggio(synth);
      expect(played.filter((e) => e.time === 1).map((e) => e.note)).toEqual([
        60, 64,
      ]);
      expect(played.filter((e) => e.time === 2).map((e) => e.note)).toEqual([
        60, 64,
      ]);
      // Each with its own level, on both steps.
      for (const event of played) {
        const expected = event.note === 60 ? (40 / 127) ** 2 : (120 / 127) ** 2;
        expect(event.gain).toBeCloseTo(expected, 12);
      }
    });

    it("resets to the first step of the mode", async () => {
      const { synth } = await built({ voices: 6 });
      synth.arp = ArpConfig("Up");
      for (const note of [60, 64, 67]) synth.start({ note, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);
      synth.arpReset();
      synth.arpStep(3);

      expect(notesOf(synth)).toEqual([60, 64, 60]);
    });
  });

  describe("switching it on and off", () => {
    it("stops the sounding chord when a config arrives", async () => {
      // D6, `null` -> config: the held set is already the set the arp reads,
      // so nothing needs seeding - but what the plain poly is sounding has to
      // stop, or the chord would drone under the arpeggio.
      const { context, synth } = await built({ voices: 4 });
      synth.start({ note: 60, time: 0 });
      synth.start({ note: 64, time: 0 });

      synth.arp = ArpConfig("Up");

      for (const voice of synth.voices) {
        const gate = writes(voice.gate);
        if (gate.length === 0) continue;
        expect(gate[gate.length - 1]).toEqual({
          method: "setValueAtTime",
          value: 0,
          time: context.currentTime,
        });
      }
    });

    it("sounds the whole held chord when the config goes away", async () => {
      // D6, config -> `null`: each held note with its own velocity, through
      // the normal path. Criterion 9's first half.
      const { context, synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, velocity: 40, time: 0 });
      synth.start({ note: 64, velocity: 120, time: 0 });
      synth.arpStep(1);

      synth.arp = null;

      const now = context.currentTime;
      const chord = arpeggio(synth).filter((e) => e.time === now);
      expect(chord.map((e) => e.note)).toEqual([60, 64]);
      expect(chord[0].gain).toBeCloseTo((40 / 127) ** 2, 12);
      expect(chord[1].gain).toBeCloseTo((120 / 127) ** 2, 12);
    });

    it("resumes at the preserved position when the config comes back", async () => {
      // Criterion 9's second half, and the reason `null` replaced an `Off`
      // enum member: turning the arp off with `Off = -1` destroyed the very
      // setting criterion 9 then asks you to resume with. A value survives
      // because the caller still holds it.
      const { synth } = await built({ voices: 8 });
      const config = ArpConfig("Up");
      synth.arp = config;
      for (const note of [60, 64, 67]) synth.start({ note, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);
      expect([notesAt(synth, 1), notesAt(synth, 2)]).toEqual([[60], [64]]);

      // Off and on again: the position is on the instrument, not in the value,
      // so the value going away cannot take the position with it.
      synth.arp = null;
      synth.arp = config;
      synth.arpStep(3);

      // The third step reads index 2 - 67 - rather than restarting at 60.
      expect(notesAt(synth, 3)).toEqual([67]);
    });

    it("takes a new config at the next step, not in the setter", async () => {
      // Criterion 7 extended to the settings, which is D11: `resize` and
      // `setMode` run at the step, so a pattern edit cannot restart a pattern
      // or write automation out of turn.
      const { synth } = await built({ voices: 8 });
      synth.arp = ArpConfig("Up");
      for (const note of [60, 64]) synth.start({ note, time: 0 });
      synth.arpStep(1);
      synth.arpStep(2);
      synth.arpStep(3);

      const before = arpeggio(synth).length;
      synth.arp = ArpConfig("Up", { octaves: 2 });
      // The assignment itself wrote nothing at all.
      expect(arpeggio(synth).length).toBe(before);

      synth.arpStep(4);
      synth.arpStep(5);
      // Continues from the preserved position and walks into the octave the
      // new value added, rather than restarting at 60.
      expect(notesOf(synth)).toEqual([60, 64, 60, 64, 72]);
    });
  });

  describe("hold and latch", () => {
    it("keeps the arpeggio running when every key is released", async () => {
      // Criterion 6.
      const { synth } = await built({ voices: 8 });
      synth.arp = ArpConfig("Up");
      synth.latch = true;
      for (const note of [60, 64] as const) synth.start({ note, time: 0 });

      synth.stop(60);
      synth.stop(64);
      synth.arpStep(1);
      synth.arpStep(2);

      expect(notesOf(synth)).toEqual([60, 64]);
    });

    it("stops the arpeggio at the next step when the latch lifts", async () => {
      const { synth } = await built({ voices: 8 });
      synth.arp = ArpConfig("Up");
      synth.latch = true;
      synth.start({ note: 60, time: 0 });
      synth.arpStep(1);

      synth.stop(60);
      synth.latch = false;
      synth.arpStep(2);
      synth.arpStep(3);

      // The one note the first step sounded, and nothing after it.
      expect(notesOf(synth)).toEqual([60]);
    });

    it("replaces the chord on a new press with nothing physically down", async () => {
      const { synth } = await built({ voices: 8 });
      synth.arp = ArpConfig("Up");
      synth.latch = true;
      for (const note of [60, 64] as const) synth.start({ note, time: 0 });
      synth.stop(60);
      synth.stop(64);

      synth.start({ note: 67, time: 0 });
      synth.arpStep(1);
      synth.arpStep(2);

      expect(notesOf(synth)).toEqual([67, 67]);
    });

    it("needs both hold and latch to lift before a release applies", async () => {
      // Criterion 10, and the whole point of the two setters being symmetric:
      // one release, one entry in one set, and neither boolean can release it
      // alone.
      const { synth } = await built({ voices: 8 });
      synth.arp = ArpConfig("Up");
      synth.hold = true;
      synth.latch = true;
      synth.start({ note: 60, time: 0 });
      synth.start({ note: 64, time: 0 });

      synth.stop(64);
      synth.hold = false; // the latch is still holding it
      synth.arpStep(1);
      synth.arpStep(2);
      expect(notesOf(synth)).toEqual([60, 64]);

      synth.latch = false; // now it applies
      synth.arpStep(3);
      synth.arpStep(4);
      expect(notesOf(synth)).toEqual([60, 64, 60, 60]);
    });

    it("is inert while there is no config", async () => {
      // D11: a latch on a plain poly is a coherent feature and not one this
      // module was asked for, so it does nothing rather than half-something.
      const { synth } = await built({ voices: 8 });
      synth.latch = true;
      synth.start({ note: 60, time: 1 });

      synth.stop(60);

      // The release was written, not swallowed.
      expect(writes(voiceAt(synth, 1).gate)).toEqual([
        { method: "setValueAtTime", value: 1, time: 1 },
        { method: "setValueAtTime", value: 0, time: 0 },
      ]);
    });

    it("clears the set and the position on a bare stop()", async () => {
      const { synth } = await built({ voices: 8 });
      synth.arp = ArpConfig("Up");
      synth.latch = true;
      for (const note of [60, 64] as const) synth.start({ note, time: 0 });
      synth.arpStep(1);

      synth.stop();

      synth.arpStep(2);
      synth.arpStep(3);
      // Nothing is held, so nothing sounds: the latch does not survive a panic.
      expect(notesOf(synth)).toEqual([60]);
    });
  });

  describe("at voices: 1", () => {
    it("glides between steps", async () => {
      // Criterion 11, and the reason `applyArp` removes the stopped note from
      // mono's stack instead of calling `monoStop`: that would close the gate,
      // and `monoStart` would then write a pitch *step* with nothing to ramp
      // from.
      const { synth } = await built({ voices: 1, glide: 0.1 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 0 });
      synth.start({ note: 64, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);

      const ramps = events(synth.voices[0].frequency).filter(
        (e) => e.method === "exponentialRampToValueAtTime",
      );
      expect(ramps).toEqual([
        {
          method: "exponentialRampToValueAtTime",
          value: toFrequency(64),
          time: 2.1,
        },
      ]);
    });

    it("dips the gate one sample before each step", async () => {
      // Criterion 5 at `voices: 1`: multi triggering, the ARP way, which is
      // `articulate`'s `justBefore` - and it only fires while something is
      // sounding, which is exactly what the silent stack removal preserves.
      const { context, synth } = await built({ voices: 1 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 0 });
      synth.start({ note: 64, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);

      expect(writes(synth.voices[0].gate)).toEqual([
        { method: "setValueAtTime", value: 1, time: 1 },
        {
          method: "setValueAtTime",
          value: 0,
          time: 2 - 1 / context.sampleRate,
        },
        { method: "setValueAtTime", value: 1, time: 2 },
      ]);
    });

    it("leaves the gate high between steps under legato", async () => {
      // Single triggering, the Minimoog way: a legato arp.
      const { synth } = await built({ voices: 1, legato: true });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 0 });
      synth.start({ note: 64, time: 0 });

      synth.arpStep(1);
      synth.arpStep(2);

      expect(writes(synth.voices[0].gate)).toEqual([
        { method: "setValueAtTime", value: 1, time: 1 },
      ]);
    });

    it("closes the gate when the arpeggio ends", async () => {
      const { context, synth } = await built({ voices: 1 });
      synth.arp = ArpConfig("Up");
      synth.start({ note: 60, time: 0 });
      synth.arpStep(1);

      synth.stop(60);
      synth.arpStep(2);

      const gate = writes(synth.voices[0].gate);
      expect(gate[gate.length - 1]).toEqual({
        method: "setValueAtTime",
        value: 0,
        time: 2 - 1 / context.sampleRate,
      });
    });

    it("walks the set with one voice", async () => {
      const { synth } = await built({ voices: 1 });
      synth.arp = ArpConfig("Up");
      for (const note of [60, 64, 67]) synth.start({ note, time: 0 });
      for (let i = 1; i <= 4; i++) synth.arpStep(i);

      expect(
        writes(synth.voices[0].frequency).map((e) => asMidi(e.value)),
      ).toEqual([60, 64, 67, 60]);
    });
  });

  describe("in a preset", () => {
    it("round-trips the config as one value", async () => {
      const { synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("UpDownExclusive", { octaves: 2 });

      const saved = JSON.parse(JSON.stringify(synth.getPreset("mine")));
      synth.arp = null;
      synth.setPreset(saved);

      expect(synth.arp).toEqual({
        mode: "UpDownExclusive",
        order: "pitch",
        octaves: 2,
        octaveMode: "serial",
      });
    });

    it("names the priority rather than numbering it", async () => {
      // D12: a preset is JSON somebody reads, so `"low"` and not `1`.
      const { synth } = await built({ voices: 1, priority: "low" });
      expect(synth.getPreset().priority).toBe("low");
    });

    it("leaves a running arp alone when the preset has no arp key", async () => {
      // The reserved options are applied only when present, exactly as
      // `glide`/`legato`/`priority` already were - so a sound saved before
      // this ticket cannot silently stop an arpeggio.
      const { synth } = await built({ voices: 4 });
      const config = ArpConfig("Up");
      synth.arp = config;

      synth.setPreset({ name: "no arp", params: { cutoff: 800 } });

      expect(synth.arp).toEqual(config);
    });

    it("clears the arp on an explicit null", async () => {
      const { synth } = await built({ voices: 4 });
      synth.arp = ArpConfig("Up");

      synth.setPreset({ name: "plain", params: {}, arp: null });

      expect(synth.arp).toBe(null);
    });

    it("validates a stale saved mode", async () => {
      const { synth } = await built({ voices: 4 });
      expect(() =>
        synth.setPreset({
          name: "stale",
          params: {},
          arp: { mode: "Sideways" } as any,
        }),
      ).toThrow(/Unknown arp mode "Sideways"/);
    });

    it("rejects a definition with a parameter named arp", async () => {
      // For free, from `arp` joining `RESERVED`: the clash is in the
      // definition, so the earliest throw is the useful one.
      const { context } = createAudioContextMock();
      expect(() =>
        Instrument(context, {
          name: "clashing",
          params: { arp: { default: 0, min: 0, max: 1 } },
          create: () => ({}) as any,
          register: async () => {},
        }),
      ).toThrow(/"arp" is a reserved preset key/);
    });

    it("throws on a bad priority name in a saved preset", async () => {
      // Where before only TypeScript checked, which a file does not go through.
      const { synth } = await built({ voices: 1 });
      expect(() =>
        synth.setPreset({ name: "stale", params: {}, priority: "loud" as any }),
      ).toThrow(/Unknown note priority "loud"/);
    });
  });
});

// The user-zone boundary at the constructor. `names.ts` has the rule; this is
// the half of it a caller meets first.
describe("the option names", () => {
  it("resolves every priority name", async () => {
    for (const priority of ["last", "low", "high", "first"] as const) {
      const { synth } = await built({ voices: 1, priority });
      expect(synth.getPreset().priority).toBe(priority);
    }
  });

  it("throws on an unknown priority, naming it and listing the four", async () => {
    // Where before there was no runtime validation at all, because TypeScript
    // was doing the work - which is no help to a preset read from a file.
    const { context } = createAudioContextMock();
    expect(() =>
      Instrument(context, stubDefinition(), { priority: "loud" as any }),
    ).toThrow(/Unknown note priority "loud"; known: last, low, high, first/);
  });

  it("throws on an unknown steal mode, naming it and listing the four", async () => {
    const { context } = createAudioContextMock();
    expect(() =>
      Instrument(context, stubDefinition(), { steal: "oldest" as any }),
    ).toThrow(/Unknown steal mode "oldest"; known: protect, lru, mru, drop/);
  });

  it("resolves every steal mode name", async () => {
    for (const steal of ["protect", "lru", "mru", "drop"] as const) {
      const { synth } = await built({ voices: 2, steal });
      expect(synth.voices.length).toBe(2);
    }
  });
});
