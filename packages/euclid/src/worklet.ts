type GenerateFn = (
  output: Float32Array,
  clock: number,
  subdivision: number
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
    this.g(outputs[0][0], params.clock[0], params.subdivision[0]);

    return this.r;
  }

  static get parameterDescriptors() {
    return [
      ["clock", 0, 0, 1],
      ["steps", 0, 0, 100],
      ["beats", 0, 0, 100],
      ["subdivision", 1, 1, 20],
      ["rotation", 0, 0, 100],
    ].map(([name, defaultValue, minValue, maxValue]) => ({
      name,
      defaultValue,
      minValue,
      maxValue,
      automationRate: "k-rate",
    }));
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

  function generate(output: Float32Array, clock: number, subdivision: number) {
    let currentClock = clock * subdivision;
    while (currentClock > 1) currentClock -= 1;
    const gate = currentClock < prevClock;
    prevClock = currentClock;
    // Advance the pattern
    if (gate) current = (current + 1) % pattern.length;
    // Fill the output
    output.fill(pattern[current]);
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
