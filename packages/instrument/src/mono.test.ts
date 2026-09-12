import { NotePriority } from "./_voices";
import {
  createMonoState,
  MonoOptions,
  MonoWrite,
  monoStart,
  monoStop,
  monoStopAll,
} from "./mono";

/**
 * The mono path, asserted on data.
 *
 * `mono.ts` answers "what should be written, and when" and knows nothing about
 * Web Audio, so Synth Secrets Part 18's tables can be transcribed and compared
 * directly against what it returns - before any of it reaches a node.
 */

const options = (over: Partial<MonoOptions> = {}): MonoOptions => ({
  priority: NotePriority.Last,
  legato: false,
  ...over,
});

const gates = (writes: MonoWrite[]) =>
  writes.filter((w) => w.param === "gate") as Extract<
    MonoWrite,
    { param: "gate" }
  >[];
const pitch = (writes: MonoWrite[]) =>
  writes.find((w) => w.param === "frequency") as
    Extract<MonoWrite, { param: "frequency" }> | undefined;
const level = (writes: MonoWrite[]) =>
  writes.find((w) => w.param === "velocity") as
    Extract<MonoWrite, { param: "velocity" }> | undefined;

/**
 * The article's figures are all the same shape: four notes, each held for four
 * beats, each starting a beat after the last. So: four presses, then four
 * releases in the same order.
 */
function play(line: number[], priority: NotePriority) {
  const state = createMonoState();
  const opts = options({ priority });
  const sounded: number[] = [];
  let time = 0;

  for (const note of line) {
    const written = pitch(
      monoStart(state, opts, { note, velocity: 100, time: time++ }),
    );
    if (written) sounded.push(written.note);
  }
  for (const note of line) {
    const written = pitch(monoStop(state, opts, { note, time: time++ }));
    if (written) sounded.push(written.note);
  }
  return sounded;
}

describe("the four priorities, from Synth Secrets Part 18", () => {
  const D4 = 62;
  const F4 = 65;
  const A4 = 69;
  const C5 = 72;

  // Figure 1: "a simple four-note sequence D-F-A-C".
  const RISING = [D4, F4, A4, C5];
  // Figure 3: "the converse of this ... a simple downward sequence".
  const FALLING = [C5, A4, F4, D4];
  // Figure 4: "a four-note sequence that changes direction", where "the
  // results are quite unexpected, and each is different from the other".
  const MIXED = [D4, A4, F4, C5];

  it("plays the rising line as Figures 2(a)-2(d) do", () => {
    // Low: the first note is held for its whole duration and the rest can only
    // speak as they become the lowest held note.
    expect(play(RISING, NotePriority.Low)).toEqual([D4, F4, A4, C5]);
    expect(play(RISING, NotePriority.First)).toEqual([D4, F4, A4, C5]);
    // High and Last: on time, but curtailed by the note above.
    expect(play(RISING, NotePriority.High)).toEqual([D4, F4, A4, C5]);
    expect(play(RISING, NotePriority.Last)).toEqual([D4, F4, A4, C5]);
  });

  it("plays the falling line as Figures 3(a)-3(d) do", () => {
    expect(play(FALLING, NotePriority.Low)).toEqual([C5, A4, F4, D4]);
    expect(play(FALLING, NotePriority.Last)).toEqual([C5, A4, F4, D4]);
    expect(play(FALLING, NotePriority.High)).toEqual([C5, A4, F4, D4]);
    expect(play(FALLING, NotePriority.First)).toEqual([C5, A4, F4, D4]);
  });

  it("drops a note of the direction-changing line under two of the four", () => {
    // "Indeed, two of the sequences play just three notes." A4 is never the
    // lowest note held and F4 is never the highest, so neither ever speaks.
    expect(play(MIXED, NotePriority.Low)).toEqual([D4, F4, C5]);
    expect(play(MIXED, NotePriority.High)).toEqual([D4, A4, C5]);
    expect(play(MIXED, NotePriority.Last)).toEqual([D4, A4, F4, C5]);
    expect(play(MIXED, NotePriority.First)).toEqual([D4, A4, F4, C5]);
  });

  it("times the four differently on the direction-changing line", () => {
    // The sounding note after each of the seven audible events, which is where
    // the four genuinely separate: what speaks, and when.
    const timeline = (priority: NotePriority) => {
      const state = createMonoState();
      const opts = options({ priority });
      const line = [D4, A4, F4, C5];
      const out: number[] = [];
      let time = 0;
      for (const note of line) {
        monoStart(state, opts, { note, velocity: 100, time: time++ });
        out.push(state.sounding);
      }
      for (const note of line.slice(0, 3)) {
        monoStop(state, opts, { note, time: time++ });
        out.push(state.sounding);
      }
      return out;
    };

    expect(timeline(NotePriority.Last)).toEqual([D4, A4, F4, C5, C5, C5, C5]);
    expect(timeline(NotePriority.Low)).toEqual([D4, D4, D4, D4, F4, F4, C5]);
    expect(timeline(NotePriority.High)).toEqual([D4, A4, A4, C5, C5, C5, C5]);
    expect(timeline(NotePriority.First)).toEqual([D4, D4, D4, D4, A4, F4, C5]);
    expect(
      new Set(
        [
          NotePriority.Last,
          NotePriority.Low,
          NotePriority.High,
          NotePriority.First,
        ].map((p) => timeline(p).join(",")),
      ).size,
    ).toBe(4);
  });
});

describe("monoStart", () => {
  it("attacks the first note without a dip", () => {
    const state = createMonoState();

    const writes = monoStart(state, options(), {
      note: 60,
      velocity: 90,
      time: 1,
    });

    expect(writes).toEqual([
      { param: "frequency", note: 60, time: 1, glide: false },
      { param: "velocity", velocity: 90, time: 1 },
      { param: "gate", value: 1, time: 1 },
    ]);
  });

  it("dips the gate by one sample on a note change while a key is held", () => {
    const state = createMonoState();
    monoStart(state, options(), { note: 60, velocity: 90, time: 1 });

    const writes = monoStart(state, options(), {
      note: 64,
      velocity: 70,
      time: 2,
    });

    expect(writes).toEqual([
      { param: "gate", value: 0, time: 2, justBefore: true },
      { param: "frequency", note: 64, time: 2, glide: true },
      { param: "velocity", velocity: 70, time: 2 },
      { param: "gate", value: 1, time: 2 },
    ]);
  });

  it("never touches the gate under legato while a key is held", () => {
    const state = createMonoState();
    const legato = options({ legato: true });
    monoStart(state, legato, { note: 60, velocity: 90, time: 1 });

    const writes = monoStart(state, legato, {
      note: 64,
      velocity: 70,
      time: 2,
    });

    expect(gates(writes)).toEqual([]);
    expect(pitch(writes)).toEqual({
      param: "frequency",
      note: 64,
      time: 2,
      glide: true,
    });
  });

  it("still attacks under legato when nothing is sounding", () => {
    const state = createMonoState();
    const legato = options({ legato: true });

    const writes = monoStart(state, legato, {
      note: 60,
      velocity: 90,
      time: 1,
    });

    expect(gates(writes)).toEqual([{ param: "gate", value: 1, time: 1 }]);
  });

  it("says nothing when the priority does not pick the pressed note", () => {
    const state = createMonoState();
    const low = options({ priority: NotePriority.Low });
    monoStart(state, low, { note: 60, velocity: 90, time: 1 });

    expect(monoStart(state, low, { note: 72, velocity: 90, time: 2 })).toEqual(
      [],
    );
    expect(state.sounding).toBe(60);
  });

  it("retriggers a note that is already sounding", () => {
    const state = createMonoState();
    monoStart(state, options(), { note: 60, velocity: 90, time: 1 });

    const writes = monoStart(state, options(), {
      note: 60,
      velocity: 30,
      time: 2,
    });

    expect(gates(writes)).toEqual([
      { param: "gate", value: 0, time: 2, justBefore: true },
      { param: "gate", value: 1, time: 2 },
    ]);
    expect(level(writes)!.velocity).toBe(30);
  });
});

describe("monoStop", () => {
  it("returns to the note underneath, with that note's velocity", () => {
    const state = createMonoState();
    monoStart(state, options(), { note: 60, velocity: 40, time: 1 });
    monoStart(state, options(), { note: 64, velocity: 110, time: 2 });

    const writes = monoStop(state, options(), { note: 64, time: 3 });

    expect(pitch(writes)).toEqual({
      param: "frequency",
      note: 60,
      time: 3,
      glide: true,
    });
    // A quiet low note stays quiet when the loud high note above it is let go.
    expect(level(writes)!.velocity).toBe(40);
    // The gate is not left down: the note underneath keeps sounding.
    expect(gates(writes).at(-1)).toEqual({ param: "gate", value: 1, time: 3 });
    expect(state.sounding).toBe(60);
  });

  it("closes the gate exactly once when the last key comes up", () => {
    const state = createMonoState();
    monoStart(state, options(), { note: 60, velocity: 90, time: 1 });

    expect(monoStop(state, options(), { note: 60, time: 3 })).toEqual([
      { param: "gate", value: 0, time: 3 },
    ]);
    // And releasing it again says nothing.
    expect(monoStop(state, options(), { note: 60, time: 4 })).toEqual([]);
    expect(state.sounding).toBe(-1);
  });

  it("says nothing when the released key was not the one sounding", () => {
    const state = createMonoState();
    monoStart(state, options(), { note: 60, velocity: 90, time: 1 });
    monoStart(state, options(), { note: 64, velocity: 90, time: 2 });

    expect(monoStop(state, options(), { note: 60, time: 3 })).toEqual([]);
    expect(state.sounding).toBe(64);
  });

  it("leaves the gate alone under legato when a note returns", () => {
    const state = createMonoState();
    const legato = options({ legato: true });
    monoStart(state, legato, { note: 60, velocity: 90, time: 1 });
    monoStart(state, legato, { note: 64, velocity: 90, time: 2 });

    expect(gates(monoStop(state, legato, { note: 64, time: 3 }))).toEqual([]);
  });

  it("closes the gate under legato when the last key comes up", () => {
    const state = createMonoState();
    const legato = options({ legato: true });
    monoStart(state, legato, { note: 60, velocity: 90, time: 1 });

    expect(monoStop(state, legato, { note: 60, time: 3 })).toEqual([
      { param: "gate", value: 0, time: 3 },
    ]);
  });
});

describe("monoStopAll", () => {
  it("empties the stack and closes the gate", () => {
    const state = createMonoState();
    monoStart(state, options(), { note: 60, velocity: 90, time: 1 });
    monoStart(state, options(), { note: 64, velocity: 90, time: 2 });

    expect(monoStopAll(state, 5)).toEqual([
      { param: "gate", value: 0, time: 5 },
    ]);
    expect(state.stack.size).toBe(0);
    expect(state.sounding).toBe(-1);
    expect(monoStopAll(state, 6)).toEqual([]);
  });
});

describe("the source of mono.ts", () => {
  it("knows nothing about Web Audio", () => {
    const source = require("fs").readFileSync(`${__dirname}/mono.ts`, "utf8");
    const code = source
      .split("\n")
      .filter((line: string) => !line.trim().startsWith("//"))
      .join("\n");

    // It returns write descriptors; the instrument applies them. That is what
    // lets the article's tables be asserted on data.
    expect(code).not.toMatch(
      /AudioParam|AudioNode|AudioContext|setValueAtTime|sampleRate/,
    );
  });
});
