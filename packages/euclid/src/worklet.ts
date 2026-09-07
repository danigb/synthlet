import { gatePulse } from "./_gate";
import { PARAMS } from "./params";

type GenerateFn = (
  output: Float32Array,
  clock: Float32Array,
  subdivision: number,
  pulseWidth: number,
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
  ) {
    // The house a-rate check, hoisted. An unautomated `clock` arrives as one
    // value and the whole block is one step of the ramp, which is what this
    // did before and costs the same.
    if (clock.length > 1) {
      for (let i = 0; i < output.length; i++) {
        output[i] = step(clock[i], subdivision, pulseWidth);
      }
    } else {
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
