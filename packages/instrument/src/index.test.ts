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
  Instrument,
  InstrumentNode,
  StealMode,
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

  it("sounds nothing at all under StealMode.Drop", async () => {
    const { synth } = await built({ voices: 2, steal: StealMode.Drop });

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
