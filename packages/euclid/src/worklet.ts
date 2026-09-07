import { createGateDetector, gatePulse } from "./_gate";
import { PARAMS } from "./params";

/** One render quantum. The spec's block size, and the unit a consumer that
 * reads its trigger once per block can actually resolve. */
const RENDER_QUANTUM = 128;

type GenerateFn = (
  output: Float32Array,
  clock: Float32Array,
  subdivision: number,
  pulseWidth: number,
  reset: Float32Array,
) => void;

type UpdateFn = (steps: number, beats: number, rotation: number) => void;

export class EuclidProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: GenerateFn;
  u: UpdateFn;

  constructor() {
    super();
    this.r = true;
    const [generate, update] = createEuclid();
    this.g = generate;
    this.u = update;
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    this.u(params.steps[0], params.beats[0], params.rotation[0]);
    this.g(
      outputs[0][0],
      params.clock,
      params.subdivision[0],
      params.pulseWidth[0],
      params.reset,
    );

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("EuclidProcessor", EuclidProcessor);

function createEuclid(): [GenerateFn, UpdateFn] {
  let $steps = 1;
  let $beats = 1;
  let $rotation = 0;
  let pattern: number[] = [1];

  // state
  let prevClock = 0;
  let current = 0;
  const detectReset = createGateDetector();

  /**
   * Arm the next step boundary to be step 0 of the pattern.
   *
   * `step()` advances the counter *on* the boundary, so this aims one short of
   * 0 rather than at it: `current = 0` here would advance to step 1, which is
   * the off-by-one that makes a reset land on the wrong step. `prevClock = 1`
   * makes the very next sample read as a boundary - every phase is below 1 -
   * so the reset takes effect on its own sample.
   */
  function reset() {
    current = pattern.length - 1;
    prevClock = 1;
  }

  // A hit is a *pulse* over the first `pulseWidth` of its step, not the step's
  // level held to the next step. Held levels merge adjacent hits - there is no
  // falling edge between them, so no rising edge for the second, and a 4/4
  // pattern used to fire exactly once, ever.
  function step(clock: number, subdivision: number, pulseWidth: number) {
    let currentClock = clock * subdivision;
    while (currentClock > 1) currentClock -= 1;
    const gate = currentClock < prevClock;
    prevClock = currentClock;
    // Advance the pattern
    if (gate) current = (current + 1) % pattern.length;
    return pattern[current] * gatePulse(currentClock, pulseWidth);
  }

  function generate(
    output: Float32Array,
    clock: Float32Array,
    subdivision: number,
    pulseWidth: number,
    resetIn: Float32Array,
  ) {
    // The house a-rate check, hoisted. An unautomated `clock` arrives as one
    // value and the whole block is one step of the ramp, which is what this
    // did before and costs the same. `reset` is read the same way, and its
    // length-1 case - unconnected, or a connected constant - is the common one.
    const rRate = resetIn.length > 1;
    if (clock.length > 1) {
      const width = clampWidth(pulseWidth, stepIncrement(clock) * subdivision);
      for (let i = 0; i < output.length; i++) {
        if (detectReset(rRate ? resetIn[i] : resetIn[0]) === true) reset();
        output[i] = step(clock[i], subdivision, width);
      }
    } else {
      // No increment to read and no within-block gate either: the whole block
      // is one value. The clamp has nothing to work with and stands aside.
      if (detectReset(resetIn[0]) === true) reset();
      output.fill(step(clock[0], subdivision, pulseWidth));
    }
  }

  function update(steps: number, beats: number, rotation: number) {
    if ($steps !== steps || $beats !== beats || $rotation !== rotation) {
      $steps = steps;
      $beats = beats;
      $rotation = rotation;
      pattern = rotate(euclid($steps, $beats), $rotation);
    }
  }

  return [generate, update];
}

/**
 * The per-sample increment of an incoming phase ramp, read off the ramp.
 *
 * `Euclid` consumes a phase rather than a tempo, so it has no increment of its
 * own - but `clock` is a-rate, and two adjacent samples of a rising ramp are
 * its increment. A pair that straddles the wrap gives a negative delta; at most
 * one wrap falls inside a block at the tempi `Clock` declares (it wraps at
 * `bpm / 60` Hz, so 16.7 Hz at the declared maximum of 1000 BPM - one wrap per
 * 2646 samples at 44.1 kHz), so a second candidate is always enough.
 */
function stepIncrement(clock: Float32Array) {
  const first = clock[1] - clock[0];
  if (first > 0) return first;
  return clock.length > 2 ? Math.max(0, clock[2] - clock[1]) : 0;
}

/**
 * Cap a pulse width so at least one render quantum of every cycle stays low.
 *
 * `pulseWidth` declares a maximum of 1, and against a `[0, 1)` phase a width of
 * 1 is a gate that never falls - which under the library's gate contract can
 * never trigger anything again. `Clock` carries the same clamp against the beat;
 * this one is against the step, which is `subdivision` times faster.
 *
 * The extra sample is because the threshold is compared at discrete samples,
 * and the increment is read back off a Float32 ramp: asking for exactly 128
 * lands on 127 often enough to be worth it.
 *
 * Inert wherever it cannot help: an unmoving clock, or a step already shorter
 * than a quantum, leaves the width alone rather than silencing the gate.
 */
function clampWidth(pulseWidth: number, increment: number) {
  const maxWidth = 1 - (RENDER_QUANTUM + 1) * increment;
  return maxWidth > 0 && pulseWidth > maxWidth ? maxWidth : pulseWidth;
}

function euclid(steps: number, beats: number) {
  const pattern: number[] = [];
  let d = -1;

  for (let i = 0; i < steps; i++) {
    const v = Math.floor(i * (beats / steps));
    pattern[i] = v !== d ? 1 : 0;
    d = v;
  }
  return pattern;
}

function rotate(array: number[], n: number) {
  const len = array.length;
  if (len === 0 || n === 0) return array;
  n = n % len;
  if (n < 0) n = len + n;
  return array.slice(-n).concat(array.slice(0, len - n));
}
