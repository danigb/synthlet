export type UpdateFn = ReturnType<typeof createDsp>["update"];
export type ComputeFn = ReturnType<typeof createDsp>["compute"];

export function createDsp(sampleRate: number) {
  let wet = 0;

  function compute(
    inputs: Float32Array[],
    outputs: Float32Array[],
    count: number
  ) {
    const inLeft = inputs[0];
    const inRight = inputs.length === 1 ? inputs[0] : inputs[1];
    const outLeft = outputs[0];
    const outRight = outputs[1];

    const dry = 1 - wet;
    for (let i = 0; i < count; i++) {
      outLeft[i] = dry * inLeft[i];
      outRight[i] = dry * inRight[i];
    }
  }

  function update(wetParam: number) {
    wet = wetParam;
  }

  return {
    update,
    compute,
  };
}
