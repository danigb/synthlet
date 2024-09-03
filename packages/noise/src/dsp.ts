export type NoiseAlgorithm = (output: Float32Array) => void;

export enum NoiseType {
  WHITE_RND = 0,
  WHITE_FAST = 1,
  PINK_COOPER = 10,
  PINK_LARRY_TRAMMEL = 11,
}

export function getNoiseAlgorithm(
  sampleRate: number,
  type: NoiseType
): NoiseAlgorithm {
  switch (type) {
    case NoiseType.WHITE_RND:
      return whiteRnd;
    case NoiseType.WHITE_FAST:
      return createWhiteFast();
    case NoiseType.PINK_COOPER:
      return createPinkCooper(sampleRate);
    case NoiseType.PINK_LARRY_TRAMMEL:
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

// Fast white noise from https://www.musicdsp.org/en/latest/Synthesis/216-fast-whitenoise-generator.html
function createWhiteFast(): NoiseAlgorithm {
  const SCALE = 2.0 / 0xffffffff;
  let g_x1 = 0x67452301;
  let g_x2 = 0xefcdab89;
  return (output) => {
    for (let i = 0; i < output.length; i++) {
      g_x1 ^= g_x2;
      output[i] = g_x2 * SCALE;
      g_x2 += g_x1;
    }
  };
}

// Pink noise from http://www.cooperbaker.com/home/code/pink%20noise/
function createPinkCooper(sampleRate: number): NoiseAlgorithm {
  // Coefficients
  const a = [0, 0, 0, 0, 0, 0, 0, 0];
  // Filter gains
  const g = [0, 0, 0, 0, 0, 0, 0, 0];
  // Filter states
  const y = [0, 0, 0, 0, 0, 0, 0, 0];
  // Filter gain
  let gain = 0;
  // Number of filters
  let filters = 0;

  const dbToA = (db: number) => Math.pow(10.0, db / 20.0);
  const aToDb = (a: number) => 20.0 * Math.log10(a);

  // Allocate temporary variables
  let i = 0;
  let db = 0;
  let ampSum = 0;

  // Calculate maximum cutoff frequency so that filter coefficient < 1.0
  let freq = sampleRate / (2 * Math.PI) - 1.0;

  // Calculate coefficients
  while (freq > 1) {
    a[i] = (2 * Math.PI * freq) / sampleRate;
    freq = freq / 4.0;
    i++;
  }

  // Store number of filters
  filters = i;

  // Calculate gains
  while (i-- > 0) {
    g[i] = dbToA(db);
    ampSum += dbToA(db);
    db -= 6.0;
  }

  // Calculate overall gain
  gain = dbToA(-aToDb(ampSum));

  return (output) => {
    for (let i = 0; i < output.length; i++) {
      let white = Math.random() * 2 - 1;
      let pink = 0.0;
      // Filter loop
      for (let i = 0; i < filters; i++) {
        // Filter the white noise
        y[i] = a[i] * white + (1.0 - a[i]) * y[i];

        // Apply gain and accumulate filtered noise
        pink += y[i] * g[i];
      }

      // Apply overall gain and copy to output
      output[i] = pink * gain;
    }
  };
}

// Pink noise generator from https://www.ridgerat-tech.us/pink/newpink.htm
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
