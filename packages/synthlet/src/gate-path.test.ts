import { AdsrEnv } from "@synthlet/adsr";
import { Param } from "@synthlet/param";

// The gate path a compound actually uses, end to end.
//
// `MonoSynth` exposes `gate` as a `Param` node's `.input` (`synths/mono.ts:25`)
// and every drum voice builds its trigger inlet the same way, so a note goes
//
//     caller -> Param.input -> Param output -> Adsr.gate
//
// and until the automation-rate folder every hop of that quantised it. Ticket
// 02 fixed the conduit, ticket 03 declared the envelope's own parameter a-rate,
// and this file is the assertion that the two meet: a gate scheduled at sample
// 40 opens the envelope at sample 40, through both nodes.
//
// It drives the two *processors* directly rather than building a `MonoSynth`.
// `test-utils.ts` records topology and nothing audio-rate, and there is no
// `AudioContext` in node - so a real compound cannot be rendered here. What
// this reproduces is the signal chain, which is where the bug was.

const BLOCK = 128;
const SAMPLE_RATE = 44100;

describe("caller -> Param -> Adsr", () => {
  let ParamProcessor: any;
  let AdsrProcessor: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    ParamProcessor = (await import("../../param/src/worklet")).ParamProcessor;
    AdsrProcessor = (await import("../../adsr/src/worklet")).AdsrProcessor;
  });

  it("declares the whole path a-rate", () => {
    // The API-level statement of the same thing, and the one a user can see:
    // `X.descriptors` is public, and it used to say k-rate at both hops.
    const rate = (descriptors: readonly any[], name: string) =>
      descriptors.find((d) => d.name === name)?.automationRate;

    expect(rate(Param.descriptors, "input")).toBe("a-rate");
    expect(rate(AdsrEnv.descriptors, "gate")).toBe("a-rate");
  });

  const adsr = {
    attack: [0.001],
    decay: [0.1],
    sustain: [0.5],
    release: [0.3],
    offset: [0],
    gain: [1],
  };

  /** One block through `Param`, then that block as `Adsr`'s gate. */
  function through(gate: ArrayLike<number>, paramInputs: any = {}) {
    const conduit = new Float32Array(BLOCK);
    new ParamProcessor().process([], [[conduit]], {
      scale: [0],
      input: gate,
      offset: [0],
      min: [0],
      max: [1],
      gain: [1],
      mod: [0],
      ...paramInputs,
    });

    const envelope = new Float32Array(BLOCK);
    new AdsrProcessor().process([[]], [[envelope]], {
      ...adsr,
      gate: conduit,
    });
    return { conduit, envelope };
  }

  it("opens the envelope at the sample the gate rises", () => {
    const EDGE = 40;
    const gate = new Float32Array(BLOCK);
    gate.fill(1, EDGE);

    const { conduit, envelope } = through(gate);

    // The conduit carries the edge...
    expect(conduit[EDGE - 1]).toBe(0);
    expect(conduit[EDGE]).toBe(1);
    // ...and the envelope acts on it there.
    expect(Array.from(envelope.subarray(0, EDGE))).toEqual(
      new Array(EDGE).fill(0),
    );
    expect(envelope[EDGE]).toBeGreaterThan(0);
  });

  it("still opens it when the gate is attenuated on the way", () => {
    // `scripts/_gate.ts`: the contract is invariant under `Param`, because
    // `input * gain + offset` with a positive gain keeps a positive signal
    // positive. Now invariant in time as well as in value.
    const EDGE = 77;
    const gate = new Float32Array(BLOCK);
    gate.fill(1, EDGE);

    const { envelope } = through(gate, { gain: [0.01] });

    expect(envelope[EDGE - 1]).toBe(0);
    expect(envelope[EDGE]).toBeGreaterThan(0);
  });

  it("is unchanged when the caller does nothing special", () => {
    // The no-regression net: a plain number on the inlet arrives as a length-1
    // array at both hops and the envelope behaves exactly as it did.
    const { conduit, envelope } = through([1]);

    expect(new Set(conduit).size).toBe(1);
    expect(conduit[0]).toBe(1);
    expect(envelope[0]).toBeGreaterThan(0);
  });
});

function createWorkletTestContext(sampleRate = SAMPLE_RATE, ctx: any = global) {
  ctx.sampleRate = sampleRate;
  ctx.registerProcessor = jest.fn();
  ctx.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: (e: any) => void };
    constructor() {
      this.port = { postMessage: jest.fn(), onmessage: () => {} };
    }
  };
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
