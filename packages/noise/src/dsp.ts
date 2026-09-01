export type NoiseAlgorithm = (output: Float32Array) => void;

export enum NoiseType {
  White = 0,
  Pink = 1,
}

export function getNoiseAlgorithm(type: number): NoiseAlgorithm {
  switch (type) {
    case NoiseType.White:
      return whiteRnd;
    case NoiseType.Pink:
      return createPinkLarryTrammel();
    default:
      console.warn("Unknown noise type: " + type);
      return whiteRnd;
  }
}

function whiteRnd(output: Float32Array) {
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.random() * 2 - 1;
  }
}

// "A New Shade of Pink" stochastic Voss-McCartney pink noise generator.
//
// Author: Larry Trammell
// Copyright: (c) Larry Trammell, 2016-2020
// Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
//          https://creativecommons.org/licenses/by/4.0/
// Source:  https://www.ridgerat-tech.us/pink/newpink.htm
//
// See THIRD-PARTY-LICENSES.md at the repository root.
function createPinkLarryTrammel(): NoiseAlgorithm {
  const pA = [3.8024, 2.9694, 2.597, 3.087, 3.4006];
  const pSum = [0.00198, 0.01478, 0.06378, 0.23378, 0.91578];
  const pASum = 15.8564;
  const contrib = [0, 0, 0, 0, 0];

  let out = 0;

  return (output) => {
    for (let i = 0; i < output.length; i++) {
      const ur1 = Math.random();
      const ur2 = Math.random();

      for (let i = 0; i < 5; i++) {
        if (ur1 < pSum[i]) {
          out -= contrib[i];
          contrib[i] = 2 * (ur2 - 0.5) * pA[i];
          out += contrib[i];
          break;
        }
      }

      output[i] = out / pASum;
    }
  };
}
