export function createChorus(sampleRate: number) {
  const dc1L = DcBlocker();
  const dc1R = DcBlocker();
  const dc2L = DcBlocker();
  const dc2R = DcBlocker();

  let _lfoRate1 = 0.5;
  let _lfoRate2 = 0.83;
  const ch1L = Chorus(sampleRate, 1.0, _lfoRate1, 7.0);
  const ch1R = Chorus(sampleRate, 1.0, _lfoRate1, 7.0);
  const ch2L = Chorus(sampleRate, 1.0, _lfoRate2, 7.0);
  const ch2R = Chorus(sampleRate, 1.0, _lfoRate2, 7.0);

  let isChorus1Enabled = true;
  let isChorus2Enabled = true;

  return {
    update(
      enable1: number,
      enable2: number,
      lfoRate1: number,
      lfoRate2: number
    ) {
      isChorus1Enabled = enable1 === 1;
      isChorus2Enabled = enable2 === 1;
      if (lfoRate1 !== _lfoRate1) {
        _lfoRate1 = lfoRate1;
        ch1L.setLfoRate(lfoRate1);
        ch1R.setLfoRate(lfoRate1);
      }
      if (lfoRate2 !== _lfoRate2) {
        _lfoRate2 = lfoRate2;
        ch2L.setLfoRate(lfoRate2);
        ch2R.setLfoRate(lfoRate2);
      }
    },

    process(inputs: Float32Array[], outputs: Float32Array[]) {
      const len = inputs[0].length;
      for (let i = 0; i < len; i++) {
        const inL = inputs[0][i];
        const inR = inputs[1][i];
        let l = inL;
        let r = inR;
        if (isChorus1Enabled) {
          l = dc1L.process(ch1L.process(l));
          r = dc1R.process(ch1R.process(r));
        }
        if (isChorus2Enabled) {
          l = dc2L.process(ch2L.process(l));
          r = dc2R.process(ch2R.process(r));
        }
        outputs[0][i] = inL + 1.4 * l;
        outputs[1][i] = inR + 1.4 * r;
      }
    },
  };
}

function DcBlocker() {
  let lastInput: number;
  let lastOutput: number;

  const cutoff = 0.01;

  lastOutput = lastInput = 0.0;

  return {
    process(input: number): number {
      const out = input - lastInput + (0.999 - cutoff * 0.4) * lastOutput;
      lastInput = input;
      lastOutput = out;
      return out;
    },
  };
}

function OnePoleLP(cutoff: number = 0.99) {
  const f = cutoff * 0.98;
  const alpha = f * f * f * f;
  let z1 = 0;

  return {
    tick(input: number) {
      const out = 1 - alpha * input + alpha * z1;
      z1 = input;
      return out;
    },
  };
}

function Chorus(
  sampleRate: number,
  phase: number,
  rate: number,
  delayTime: number
) {
  let z1 = 0;
  let sign = 0;
  let lfoPhase = phase * 2 - 1;
  let lfoStepSize = (4 * rate) / sampleRate;
  let lfoSign = 1;

  const delayLineLength = Math.floor(sampleRate * delayTime * 0.001) * 2;
  const delayLine = new Float32Array(delayLineLength).fill(0);
  let writeIndex = delayLineLength - 1;
  let delayLineOutput = 0;
  const lpf = OnePoleLP(0.99);

  function nextLfo() {
    if (lfoPhase >= 1) lfoSign = -1;
    if (lfoPhase <= -1) lfoSign = 1;
    lfoPhase += lfoSign * lfoStepSize;
    return lfoPhase;
  }

  return {
    setLfoRate(rate: number) {
      lfoStepSize = (4 * rate) / sampleRate;
    },

    process(input: number): number {
      const offset = (0.3 * nextLfo() + 0.4) * delayTime * sampleRate * 0.001;

      let ptr = writeIndex - Math.floor(offset);
      if (ptr < 0) ptr += delayLineLength;

      let ptr2 = ptr - 1;
      if (ptr2 < 0) ptr2 += delayLineLength;

      const frac = offset - Math.floor(offset);
      delayLineOutput =
        delayLine[ptr2] + delayLine[ptr] * (1 - frac) - (1 - frac) * z1;
      delayLineOutput = lpf.tick(delayLineOutput);
      z1 = delayLineOutput;

      delayLine[writeIndex] = input;

      writeIndex++;
      if (writeIndex >= delayLineLength) writeIndex = 0;

      return delayLineOutput;
    },
  };
}
